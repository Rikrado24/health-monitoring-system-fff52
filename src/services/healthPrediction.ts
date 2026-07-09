import { addDoc, collection } from "firebase/firestore";
import knnExport from "../generated/health_status_knn.json";
import modelMetadata from "../generated/health_status_model_metadata.json";
import labelMapping from "../generated/label_mapping.json";
import {
  createHealthPredictionVector,
  sanitizeHealthPredictionInput,
  type HealthPredictionFeatures,
} from "./healthFeatureEngineering";
import type { HealthPredictionDoc } from "../types/storage";
import { db } from "./firebase";
import { getHealthLearningSamples, recordHealthLearningSample, type HealthLearningSample } from "./healthLearning";

type PredictionInput = HealthPredictionFeatures;

type KnnSample = {
  values: number[];
  label: number;
  support?: number;
};

type WeightedMemorySample = HealthLearningSample & {
  values: number[];
};

type KnnScaler = {
  center: number[];
  scale: number[];
};

type KnnExport = {
  model_name: string;
  algorithm: string;
  features: string[];
  target: string;
  k: number;
  weights: "distance" | "uniform" | string;
  metric: string;
  accuracy: number;
  dataset_rows: number;
  training_date: string;
  class_distribution?: Record<string, number>;
  class_labels: Record<string, string>;
  scaler: KnnScaler;
  samples: KnnSample[];
  p?: number;
};

type ModelMetadata = {
  algorithm: string;
  features: string[];
  target: string;
  training_date: string;
  accuracy: number;
  dataset_rows: number;
  model_name?: string;
};

type HealthPredictionResult = {
  healthStatusCode: number;
  healthStatusLabel: string;
  recommendation: string;
  modelName: string;
  modelAlgorithm: string;
  accuracy: number;
  confidence: number;
  probabilities: Record<string, number>;
  input: PredictionInput;
};

const KNN = knnExport as KnnExport;
const METADATA = modelMetadata as ModelMetadata;
const LABELS = (labelMapping as Record<string, string>) ?? {};

const RECOMMENDATIONS: Record<number, string> = {
  0: "Pertahankan pola hidup sehat, aktivitas rutin, dan pemeriksaan berkala.",
  1: "Perbaiki pola makan, tidur, dan aktivitas, lalu pantau ulang hasilnya.",
  2: "Segera konsultasikan ke tenaga medis dan lakukan pemantauan lebih sering.",
};

const deriveRuleBasedHealthStatus = (input: PredictionInput) => {
  const healthyWindows = [
    input.bmi >= 18.5 && input.bmi <= 24.9,
    input.heart_rate >= 60 && input.heart_rate <= 95,
    input.systolic_bp >= 100 && input.systolic_bp <= 124,
    input.diastolic_bp >= 65 && input.diastolic_bp <= 82,
    input.steps >= 5500,
    input.age <= 60,
  ];

  const riskWindows = [
    input.bmi < 17.0 || input.bmi >= 30.0,
    input.heart_rate < 55 || input.heart_rate >= 105,
    input.systolic_bp < 95 || input.systolic_bp >= 140,
    input.diastolic_bp < 60 || input.diastolic_bp >= 90,
    input.steps < 3500,
    input.age >= 70,
  ];

  const improvingTrendWindows = [
    input.recent_weight_delta_kg <= 0.5,
    input.recent_bmi_delta <= 0.2,
    input.recent_heart_rate_delta <= 5,
    input.recent_systolic_delta <= 5,
    input.recent_diastolic_delta <= 4,
    input.recent_steps_delta >= -1500,
    input.recent_meal_calorie_delta <= 300,
    input.recent_hydration_delta >= -2,
    input.recent_sleep_hours_delta >= -0.8,
    input.recent_activity_calorie_delta >= -120,
  ];

  const worseningTrendWindows = [
    input.recent_weight_delta_kg >= 1.2,
    input.recent_bmi_delta >= 0.6,
    input.recent_heart_rate_delta >= 8,
    input.recent_systolic_delta >= 8,
    input.recent_diastolic_delta >= 6,
    input.recent_steps_delta <= -2200,
    input.recent_meal_calorie_delta >= 400,
    input.recent_hydration_delta <= -3,
    input.recent_sleep_hours_delta <= -1,
    input.recent_activity_calorie_delta <= -160,
  ];

  if (riskWindows.filter(Boolean).length >= 2 || worseningTrendWindows.filter(Boolean).length >= 4) return 2;
  if (healthyWindows.filter(Boolean).length >= 5 && improvingTrendWindows.filter(Boolean).length >= 6) return 0;
  return 1;
};

const standardizeVector = (values: number[], scaler: KnnScaler) =>
  values.map((value, index) => {
    const mean = scaler.center[index] ?? 0;
    const scale = scaler.scale[index] ?? 1;
    const safeScale = Math.abs(scale) > 1e-9 ? scale : 1;
    return (value - mean) / safeScale;
  });

const minkowskiDistance = (left: number[], right: number[], p: number) => {
  const power = Math.max(1, Number(p) || 1);
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const diff = Math.abs((left[index] ?? 0) - (right[index] ?? 0));
    sum += Math.pow(diff, power);
  }
  return Math.pow(sum, 1 / power);
};

const SOURCE_WEIGHTS: Record<"prediction" | "chat" | "manual", number> = {
  prediction: 1,
  chat: 0.9,
  manual: 1.08,
};

const SCOPE_WEIGHTS: Record<"global" | "personal", number> = {
  global: 0.74,
  personal: 1.42,
};

const getRecencyWeight = (createdAt?: string) => {
  if (!createdAt) return 1;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 1;
  const ageDays = Math.max(0, (Date.now() - created.getTime()) / 86400000);
  if (ageDays <= 3) return 1.18;
  if (ageDays <= 14) return 1.1;
  if (ageDays <= 45) return 1.02;
  if (ageDays <= 120) return 0.95;
  return 0.88;
};

const getSampleWeight = (sample: {
  support?: number;
  source?: "prediction" | "chat" | "manual";
  scope?: "global" | "personal";
  createdAt?: string;
}) => {
  const supportWeight = Math.max(1, Number(sample.support || 1));
  const sourceWeight = sample.source ? SOURCE_WEIGHTS[sample.source] || 1 : 1;
  const scopeWeight = sample.scope ? SCOPE_WEIGHTS[sample.scope] || 1 : 1;
  const recencyWeight = getRecencyWeight(sample.createdAt);
  return supportWeight * sourceWeight * scopeWeight * recencyWeight;
};

const predictWithKnn = (input: PredictionInput) => {
  const featureVector = createHealthPredictionVector(input);
  const standardizedInput = standardizeVector(featureVector, KNN.scaler);
  const memorySamples = getHealthLearningSamples().map((sample) => ({
    ...sample,
    values: standardizeVector(sample.values, KNN.scaler),
  })) as WeightedMemorySample[];
  const baseSamples = Array.isArray(KNN.samples) ? KNN.samples : [];
  const samples = [...baseSamples, ...memorySamples];
  const k = Math.max(1, Math.min(Number(KNN.k) || 3, samples.length || 1));

  if (samples.length === 0) {
    const fallbackCode = deriveRuleBasedHealthStatus(input);
    return {
      code: fallbackCode,
      confidence: 0.5,
      probabilities: {
        [LABELS[String(fallbackCode)] || String(fallbackCode)]: 1,
      },
    };
  }

  const scoredSamples = samples
    .map((sample) => ({
      label: sample.label,
      support: getSampleWeight(sample),
      distance: minkowskiDistance(standardizedInput, sample.values, KNN.p || 1),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, k);

  const exactMatch = scoredSamples.find((sample) => sample.distance <= 1e-9);
  if (exactMatch) {
    const labelText = LABELS[String(exactMatch.label)] || String(exactMatch.label);
    return {
      code: exactMatch.label,
      confidence: 1,
      probabilities: {
        [labelText]: 1,
      },
    };
  }

  const votes = new Map<number, number>();
  let totalWeight = 0;

  scoredSamples.forEach((sample) => {
    const weight = (KNN.weights === "uniform" ? 1 : 1 / Math.max(sample.distance, 1e-9)) * Math.max(1, sample.support || 1);
    totalWeight += weight;
    votes.set(sample.label, (votes.get(sample.label) || 0) + weight);
  });

  let chosenCode = scoredSamples[0]?.label ?? 1;
  let chosenScore = -Infinity;
  const probabilities: Record<string, number> = {};

  votes.forEach((score, label) => {
    if (score > chosenScore) {
      chosenScore = score;
      chosenCode = label;
    }
  });

  Array.from(new Set(samples.map((sample) => sample.label))).forEach((label) => {
    const labelText = LABELS[String(label)] || String(label);
    const score = votes.get(label) || 0;
    probabilities[labelText] = totalWeight > 0 ? Number((score / totalWeight).toFixed(4)) : 0;
  });

  if (Object.keys(probabilities).length === 0) {
    const labelText = LABELS[String(chosenCode)] || String(chosenCode);
    probabilities[labelText] = 1;
  }

  const confidence = probabilities[LABELS[String(chosenCode)] || String(chosenCode)] ?? 0;

  return {
    code: chosenCode,
    confidence,
    probabilities,
  };
};

export const getHealthModelMetadata = () => ({
  modelName: METADATA.model_name || KNN.model_name || "KNN Health Classifier",
  modelAlgorithm: METADATA.algorithm || KNN.algorithm || "KNeighborsClassifier",
  accuracy: METADATA.accuracy || KNN.accuracy || 0,
  datasetRows: METADATA.dataset_rows || KNN.dataset_rows || 0,
  trainingDate: METADATA.training_date || KNN.training_date || "",
  features: METADATA.features || KNN.features || [],
});

export function normalizeHealthPredictionInput(input: Partial<PredictionInput> & { gender?: number | string }) {
  return sanitizeHealthPredictionInput(input);
}

export function predictHealthStatus(input: Partial<PredictionInput> & { gender?: number | string }): HealthPredictionResult {
  const sanitized = sanitizeHealthPredictionInput(input);
  const result = predictWithKnn(sanitized);
  const label = LABELS[String(result.code)] || KNN.class_labels[String(result.code)] || `Class ${result.code}`;
  const confidence = Number((result.confidence || 0).toFixed(4));

  return {
    healthStatusCode: result.code,
    healthStatusLabel: label,
    recommendation: RECOMMENDATIONS[result.code] || RECOMMENDATIONS[1],
    modelName: METADATA.model_name || KNN.model_name || "KNN Health Classifier",
    modelAlgorithm: METADATA.algorithm || KNN.algorithm || "KNeighborsClassifier",
    accuracy: METADATA.accuracy || KNN.accuracy || 0,
    confidence,
    probabilities: result.probabilities,
    input: sanitized,
  };
}

export async function saveHealthPredictionForUser(userUid: string, prediction: HealthPredictionResult) {
  const payload: HealthPredictionDoc = {
    age: prediction.input.age,
    gender: prediction.input.gender,
    height_cm: prediction.input.height_cm,
    weight_kg: prediction.input.weight_kg,
    bmi: prediction.input.bmi,
    heart_rate: prediction.input.heart_rate,
    systolic_bp: prediction.input.systolic_bp,
    diastolic_bp: prediction.input.diastolic_bp,
    steps: prediction.input.steps,
    recent_weight_delta_kg: prediction.input.recent_weight_delta_kg,
    recent_bmi_delta: prediction.input.recent_bmi_delta,
    recent_heart_rate_delta: prediction.input.recent_heart_rate_delta,
    recent_systolic_delta: prediction.input.recent_systolic_delta,
    recent_diastolic_delta: prediction.input.recent_diastolic_delta,
    recent_steps_delta: prediction.input.recent_steps_delta,
    recent_meal_calorie_delta: prediction.input.recent_meal_calorie_delta,
    recent_hydration_delta: prediction.input.recent_hydration_delta,
    recent_sleep_hours_delta: prediction.input.recent_sleep_hours_delta,
    recent_activity_calorie_delta: prediction.input.recent_activity_calorie_delta,
    predicted_status: prediction.healthStatusCode,
    predicted_status_label: prediction.healthStatusLabel,
    recommendation: prediction.recommendation,
    model_name: prediction.modelName,
    model_accuracy: prediction.accuracy,
    model_algorithm: prediction.modelAlgorithm,
    confidence: prediction.confidence,
    created_at: new Date().toISOString(),
  };

  const predictionRef = await addDoc(collection(db, "users", userUid, "health_predictions"), payload);
  if (prediction.confidence >= 0.65) {
    void recordHealthLearningSample(userUid, {
      age: prediction.input.age,
      gender: prediction.input.gender,
      height_cm: prediction.input.height_cm,
      weight_kg: prediction.input.weight_kg,
      bmi: prediction.input.bmi,
      heart_rate: prediction.input.heart_rate,
      systolic_bp: prediction.input.systolic_bp,
      diastolic_bp: prediction.input.diastolic_bp,
      steps: prediction.input.steps,
      recent_weight_delta_kg: prediction.input.recent_weight_delta_kg,
      recent_bmi_delta: prediction.input.recent_bmi_delta,
      recent_heart_rate_delta: prediction.input.recent_heart_rate_delta,
      recent_systolic_delta: prediction.input.recent_systolic_delta,
      recent_diastolic_delta: prediction.input.recent_diastolic_delta,
      recent_steps_delta: prediction.input.recent_steps_delta,
      recent_meal_calorie_delta: prediction.input.recent_meal_calorie_delta,
      recent_hydration_delta: prediction.input.recent_hydration_delta,
      recent_sleep_hours_delta: prediction.input.recent_sleep_hours_delta,
      recent_activity_calorie_delta: prediction.input.recent_activity_calorie_delta,
      label: prediction.healthStatusCode,
      label_name: prediction.healthStatusLabel,
      confidence: prediction.confidence,
      support: prediction.confidence >= 0.85 ? 2 : 1,
      source: "prediction",
      created_at: payload.created_at,
      updated_at: payload.created_at,
      note: `prediction:${predictionRef.id}`,
      uid: userUid,
    }).catch((error) => {
      console.error("recordHealthLearningSample failed", error);
    });
  }
  return { ok: true as const, id: predictionRef.id, payload };
}

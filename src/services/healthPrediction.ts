import { addDoc, collection } from "firebase/firestore";
import knnExport from "../generated/health_status_knn.json";
import modelMetadata from "../generated/health_status_model_metadata.json";
import labelMapping from "../generated/label_mapping.json";
import type { HealthPredictionDoc } from "../types/storage";
import { db } from "./firebase";

type PredictionInput = {
  age: number;
  gender: number;
  height_cm: number;
  weight_kg: number;
  bmi: number;
  heart_rate: number;
  systolic_bp: number;
  diastolic_bp: number;
  steps: number;
};

type KnnSample = {
  values: number[];
  label: number;
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

  if (riskWindows.filter(Boolean).length >= 2) return 2;
  if (healthyWindows.filter(Boolean).length >= 5) return 0;
  return 1;
};

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeGenderCode = (value: unknown) => {
  if (typeof value === "number") return value === 1 ? 1 : 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "l", "m", "male", "pria", "laki-laki", "laki laki", "laki"].includes(text)) return 1;
  return 0;
};

const computeBmi = (heightCm: number, weightKg: number) => {
  if (heightCm <= 0 || weightKg <= 0) return 0;
  return Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));
};

const sanitizeInput = (input: Partial<PredictionInput> & { gender?: number | string }) => {
  const height_cm = normalizeNumber(input.height_cm);
  const weight_kg = normalizeNumber(input.weight_kg);
  const bmiValue = normalizeNumber(input.bmi);

  return {
    age: Math.max(0, Math.round(normalizeNumber(input.age))),
    gender: normalizeGenderCode(input.gender),
    height_cm: Number(height_cm.toFixed(1)),
    weight_kg: Number(weight_kg.toFixed(1)),
    bmi: bmiValue > 0 ? Number(bmiValue.toFixed(1)) : computeBmi(height_cm, weight_kg),
    heart_rate: Math.max(0, Number(normalizeNumber(input.heart_rate).toFixed(1))),
    systolic_bp: Math.max(0, Number(normalizeNumber(input.systolic_bp).toFixed(1))),
    diastolic_bp: Math.max(0, Number(normalizeNumber(input.diastolic_bp).toFixed(1))),
    steps: Math.max(0, Number(normalizeNumber(input.steps).toFixed(1))),
  };
};

const createFeatureVector = (input: PredictionInput) => [
  input.age,
  input.gender,
  input.height_cm,
  input.weight_kg,
  input.bmi,
  input.heart_rate,
  input.systolic_bp,
  input.diastolic_bp,
  input.steps,
];

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

const predictWithKnn = (input: PredictionInput) => {
  const featureVector = createFeatureVector(input);
  const standardizedInput = standardizeVector(featureVector, KNN.scaler);
  const samples = Array.isArray(KNN.samples) ? KNN.samples : [];
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
    const weight = KNN.weights === "uniform" ? 1 : 1 / Math.max(sample.distance, 1e-9);
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
  return sanitizeInput(input);
}

export function predictHealthStatus(input: Partial<PredictionInput> & { gender?: number | string }): HealthPredictionResult {
  const sanitized = sanitizeInput(input);
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
  return { ok: true as const, id: predictionRef.id, payload };
}

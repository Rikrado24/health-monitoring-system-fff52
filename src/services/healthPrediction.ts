import { addDoc, collection } from "firebase/firestore";
import treeExport from "../generated/health_status_tree.json";
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

type TreeLeaf = {
  type: "leaf";
  samples: number;
  value: number[];
  prediction: number;
  label: string;
  probabilities: number[];
};

type TreeNode = {
  type: "node";
  feature: string;
  threshold: number;
  samples: number;
  left: TreeBranch;
  right: TreeBranch;
};

type TreeBranch = TreeLeaf | TreeNode;

type TreeExport = {
  model_name: string;
  algorithm: string;
  features: string[];
  target: string;
  class_labels: Record<string, string>;
  tree: TreeBranch;
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

const TREE = treeExport as TreeExport;
const METADATA = modelMetadata as ModelMetadata;
const LABELS = labelMapping as Record<string, string>;

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
  return {
    age: Math.max(0, Math.round(normalizeNumber(input.age))),
    gender: normalizeGenderCode(input.gender),
    height_cm: Number(height_cm.toFixed(1)),
    weight_kg: Number(weight_kg.toFixed(1)),
    bmi: normalizeNumber(input.bmi) > 0 ? Number(normalizeNumber(input.bmi).toFixed(1)) : computeBmi(height_cm, weight_kg),
    heart_rate: Math.max(0, Number(normalizeNumber(input.heart_rate).toFixed(1))),
    systolic_bp: Math.max(0, Number(normalizeNumber(input.systolic_bp).toFixed(1))),
    diastolic_bp: Math.max(0, Number(normalizeNumber(input.diastolic_bp).toFixed(1))),
    steps: Math.max(0, Number(normalizeNumber(input.steps).toFixed(1))),
  };
};

const evaluateTree = (node: TreeBranch, input: PredictionInput): TreeLeaf => {
  if (node.type === "leaf") {
    return node;
  }

  const value = normalizeNumber(input[node.feature as keyof PredictionInput]);
  return value <= node.threshold ? evaluateTree(node.left, input) : evaluateTree(node.right, input);
};

export const getHealthModelMetadata = () => ({
  modelName: METADATA.model_name || TREE.model_name || "Decision Tree Health Classifier",
  modelAlgorithm: METADATA.algorithm || TREE.algorithm || "DecisionTreeClassifier",
  accuracy: METADATA.accuracy || 0,
  datasetRows: METADATA.dataset_rows || 0,
  trainingDate: METADATA.training_date || "",
  features: METADATA.features || TREE.features || [],
});

export function normalizeHealthPredictionInput(input: Partial<PredictionInput> & { gender?: number | string }) {
  return sanitizeInput(input);
}

export function predictHealthStatus(input: Partial<PredictionInput> & { gender?: number | string }): HealthPredictionResult {
  const sanitized = sanitizeInput(input);
  const leaf = evaluateTree(TREE.tree, sanitized);
  const predictedCode = leaf.prediction;
  const ruleBasedCode = deriveRuleBasedHealthStatus(sanitized);
  const chosenCode = predictedCode === ruleBasedCode || (leaf.samples >= 8 && Math.max(...leaf.probabilities) >= 0.7) ? predictedCode : ruleBasedCode;
  const label = LABELS[String(chosenCode)] || leaf.label || `Class ${chosenCode}`;
  const probabilities = leaf.probabilities.reduce<Record<string, number>>((result, probability, index) => {
    result[LABELS[String(index)] || String(index)] = probability;
    return result;
  }, {});
  const chosenProbability = leaf.probabilities[chosenCode] ?? Math.max(...leaf.probabilities);

  return {
    healthStatusCode: chosenCode,
    healthStatusLabel: label,
    recommendation: RECOMMENDATIONS[chosenCode] || RECOMMENDATIONS[1],
    modelName: METADATA.model_name || TREE.model_name || "Decision Tree Health Classifier",
    modelAlgorithm: METADATA.algorithm || TREE.algorithm || "DecisionTreeClassifier",
    accuracy: METADATA.accuracy || 0,
    confidence: Number((chosenCode === predictedCode ? Math.max(...leaf.probabilities) : Math.max(chosenProbability, 0.55)).toFixed(4)),
    probabilities,
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

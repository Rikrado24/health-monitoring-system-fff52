export const HEALTH_BASE_FEATURE_KEYS = [
  "age",
  "gender",
  "height_cm",
  "weight_kg",
  "bmi",
  "heart_rate",
  "systolic_bp",
  "diastolic_bp",
  "steps",
] as const;

export const HEALTH_TREND_FEATURE_KEYS = [
  "recent_weight_delta_kg",
  "recent_bmi_delta",
  "recent_heart_rate_delta",
  "recent_systolic_delta",
  "recent_diastolic_delta",
  "recent_steps_delta",
  "recent_meal_calorie_delta",
  "recent_hydration_delta",
  "recent_sleep_hours_delta",
  "recent_activity_calorie_delta",
] as const;

export const HEALTH_PREDICTION_FEATURE_KEYS = [...HEALTH_BASE_FEATURE_KEYS, ...HEALTH_TREND_FEATURE_KEYS] as const;

export type HealthBaseFeatures = {
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

export type HealthTrendFeatures = {
  recent_weight_delta_kg: number;
  recent_bmi_delta: number;
  recent_heart_rate_delta: number;
  recent_systolic_delta: number;
  recent_diastolic_delta: number;
  recent_steps_delta: number;
  recent_meal_calorie_delta: number;
  recent_hydration_delta: number;
  recent_sleep_hours_delta: number;
  recent_activity_calorie_delta: number;
};

export type HealthPredictionFeatures = HealthBaseFeatures & HealthTrendFeatures;

export const ZERO_TREND_FEATURES: HealthTrendFeatures = {
  recent_weight_delta_kg: 0,
  recent_bmi_delta: 0,
  recent_heart_rate_delta: 0,
  recent_systolic_delta: 0,
  recent_diastolic_delta: 0,
  recent_steps_delta: 0,
  recent_meal_calorie_delta: 0,
  recent_hydration_delta: 0,
  recent_sleep_hours_delta: 0,
  recent_activity_calorie_delta: 0,
};

export function normalizeHealthNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeGenderCode(value: unknown) {
  if (typeof value === "number") return value === 1 ? 1 : 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "l", "m", "male", "pria", "laki-laki", "laki laki", "laki"].includes(text)) return 1;
  return 0;
}

export function computeBmi(heightCm: number, weightKg: number) {
  if (heightCm <= 0 || weightKg <= 0) return 0;
  return Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));
}

export function sanitizeHealthPredictionInput(input: Partial<HealthPredictionFeatures> & { gender?: number | string }) {
  const height_cm = normalizeHealthNumber(input.height_cm);
  const weight_kg = normalizeHealthNumber(input.weight_kg);
  const bmiValue = normalizeHealthNumber(input.bmi);

  return {
    age: Math.max(0, Math.round(normalizeHealthNumber(input.age))),
    gender: normalizeGenderCode(input.gender),
    height_cm: Number(height_cm.toFixed(1)),
    weight_kg: Number(weight_kg.toFixed(1)),
    bmi: bmiValue > 0 ? Number(bmiValue.toFixed(1)) : computeBmi(height_cm, weight_kg),
    heart_rate: Math.max(0, Number(normalizeHealthNumber(input.heart_rate).toFixed(1))),
    systolic_bp: Math.max(0, Number(normalizeHealthNumber(input.systolic_bp).toFixed(1))),
    diastolic_bp: Math.max(0, Number(normalizeHealthNumber(input.diastolic_bp).toFixed(1))),
    steps: Math.max(0, Number(normalizeHealthNumber(input.steps).toFixed(1))),
    recent_weight_delta_kg: Number(normalizeHealthNumber(input.recent_weight_delta_kg).toFixed(1)),
    recent_bmi_delta: Number(normalizeHealthNumber(input.recent_bmi_delta).toFixed(1)),
    recent_heart_rate_delta: Number(normalizeHealthNumber(input.recent_heart_rate_delta).toFixed(1)),
    recent_systolic_delta: Number(normalizeHealthNumber(input.recent_systolic_delta).toFixed(1)),
    recent_diastolic_delta: Number(normalizeHealthNumber(input.recent_diastolic_delta).toFixed(1)),
    recent_steps_delta: Number(normalizeHealthNumber(input.recent_steps_delta).toFixed(1)),
    recent_meal_calorie_delta: Number(normalizeHealthNumber(input.recent_meal_calorie_delta).toFixed(1)),
    recent_hydration_delta: Number(normalizeHealthNumber(input.recent_hydration_delta).toFixed(1)),
    recent_sleep_hours_delta: Number(normalizeHealthNumber(input.recent_sleep_hours_delta).toFixed(1)),
    recent_activity_calorie_delta: Number(normalizeHealthNumber(input.recent_activity_calorie_delta).toFixed(1)),
  };
}

export function createHealthPredictionVector(input: HealthPredictionFeatures) {
  return [
    input.age,
    input.gender,
    input.height_cm,
    input.weight_kg,
    input.bmi,
    input.heart_rate,
    input.systolic_bp,
    input.diastolic_bp,
    input.steps,
    input.recent_weight_delta_kg,
    input.recent_bmi_delta,
    input.recent_heart_rate_delta,
    input.recent_systolic_delta,
    input.recent_diastolic_delta,
    input.recent_steps_delta,
    input.recent_meal_calorie_delta,
    input.recent_hydration_delta,
    input.recent_sleep_hours_delta,
    input.recent_activity_calorie_delta,
  ];
}

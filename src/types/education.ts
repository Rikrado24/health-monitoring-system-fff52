export type EducationHealthAnalysis = {
  bmiValue: number;
  bmiStatus: "Kurang" | "Normal" | "Overweight" | "Obesitas" | "Belum ada data";
  activityStatus: "Aktif" | "Cukup aktif" | "Kurang aktif" | "Sangat kurang aktif" | "Belum ada data";
  hydrationStatus: "Cukup" | "Perlu ditambah" | "Belum ada data";
  bloodPressureStatus: "Rendah" | "Normal" | "Waspada" | "Tinggi" | "Belum ada data";
  heartRateStatus: "Rendah" | "Normal" | "Tinggi" | "Belum ada data";
  overallStatus: "Baik" | "Perlu dipantau" | "Perlu perhatian";
  overallRecommendation: string;
  educationalNotes: string[];
};

export type EducationSourceData = {
  patientName: string;
  age?: string | number;
  gender?: string;
  location?: string;
  height?: number;
  weight?: number;
  bmi?: number;
  bloodPressure?: string;
  bloodPressureStatus?: string;
  heartRate?: number;
  heartRateStatus?: string;
  steps?: number;
  waterGlasses?: number;
  mealCalories?: number;
  mealSummary?: string;
  activitySummary?: string;
  hydrationSummary?: string;
  sleepSummary?: string;
  recentHistorySummary?: string;
  recentTrendSummary?: string;
  prioritySummary?: string;
  recentMeasurementSummary?: string;
  recentActivitySummary?: string;
  recentNutritionSummary?: string;
  latestMeasurementAt?: string;
};

export type EducationPromptContext = {
  patientName: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  location: string;
  healthSummary: string;
  recentHistorySummary: string;
  recentTrendSummary: string;
  prioritySummary: string;
  recentMeasurementSummary: string;
  recentActivitySummary: string;
  recentNutritionSummary: string;
  sleepSummary: string;
  bloodPressure: string;
  bloodPressureStatus: string;
  heartRate: string;
  heartRateStatus: string;
  activitySummary: string;
  mealSummary: string;
  hydrationSummary: string;
};

export type EducationContext = {
  educationContext: EducationPromptContext;
  analysis: EducationHealthAnalysis;
  promptSummary: string;
};

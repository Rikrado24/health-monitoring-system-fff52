import { analyzeEducationTopic, generateEducationReply } from "./educationResponder";
import { predictHealthStatus } from "./healthPrediction";
import type {
  EducationContext,
  EducationHealthAnalysis,
  EducationSourceData,
} from "../types/education";

type ChatHistoryEntry = {
  role: "assistant" | "user";
  text: string;
};

const formatNumber = (value: number, digits = 0) => {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatSentence = (parts: string[]) => parts.filter((part) => part.trim() !== "").join(", ");

const parseBloodPressure = (value?: string) => {
  const [systolicRaw, diastolicRaw] = String(value || "").split("/");
  return {
    systolic: Number(systolicRaw) || 0,
    diastolic: Number(diastolicRaw) || 0,
  };
};

const computeBmi = (heightCm?: number, weightKg?: number) => {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return 0;
  return Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));
};

const normalizeAge = (value?: string | number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed)) : "-";
};

const normalizeText = (value?: string) => value?.trim() || "-";

const analyzeBmi = (bmi: number): EducationHealthAnalysis["bmiStatus"] => {
  if (!Number.isFinite(bmi) || bmi <= 0) return "Belum ada data";
  if (bmi < 18.5) return "Kurang";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obesitas";
};

const analyzeActivity = (steps?: number): EducationHealthAnalysis["activityStatus"] => {
  if (!Number.isFinite(steps || 0) || (steps || 0) <= 0) return "Belum ada data";
  if ((steps || 0) >= 10000) return "Aktif";
  if ((steps || 0) >= 7000) return "Cukup aktif";
  if ((steps || 0) >= 4000) return "Kurang aktif";
  return "Sangat kurang aktif";
};

const analyzeHydration = (waterGlasses?: number): EducationHealthAnalysis["hydrationStatus"] => {
  if (!Number.isFinite(waterGlasses || 0) || (waterGlasses || 0) <= 0) return "Belum ada data";
  if ((waterGlasses || 0) >= 7) return "Cukup";
  return "Perlu ditambah";
};

const analyzeBloodPressure = (bloodPressure?: string, bloodPressureStatus?: string): EducationHealthAnalysis["bloodPressureStatus"] => {
  const normalizedStatus = normalizeText(bloodPressureStatus).toLowerCase();
  if (normalizedStatus.includes("rendah")) return "Rendah";
  if (normalizedStatus.includes("normal")) return "Normal";
  if (normalizedStatus.includes("waspada")) return "Waspada";
  if (normalizedStatus.includes("tinggi")) return "Tinggi";

  const { systolic, diastolic } = parseBloodPressure(bloodPressure);
  if (!systolic || !diastolic) return "Belum ada data";
  if (systolic < 90 || diastolic < 60) return "Rendah";
  if (systolic <= 129 && diastolic <= 84) return "Normal";
  if (systolic <= 139 || diastolic <= 89) return "Waspada";
  return "Tinggi";
};

const analyzeHeartRate = (heartRate?: number, heartRateStatus?: string): EducationHealthAnalysis["heartRateStatus"] => {
  const normalizedStatus = normalizeText(heartRateStatus).toLowerCase();
  if (normalizedStatus.includes("rendah")) return "Rendah";
  if (normalizedStatus.includes("normal")) return "Normal";
  if (normalizedStatus.includes("tinggi")) return "Tinggi";

  if (!Number.isFinite(heartRate || 0) || (heartRate || 0) <= 0) return "Belum ada data";
  if ((heartRate || 0) < 60) return "Rendah";
  if ((heartRate || 0) <= 100) return "Normal";
  return "Tinggi";
};

export function analyzeHealthParameters(data: EducationSourceData): EducationHealthAnalysis {
  const bmiValue = data.bmi && data.bmi > 0 ? Number(data.bmi.toFixed(1)) : computeBmi(data.height, data.weight);
  const bmiStatus = analyzeBmi(bmiValue);
  const activityStatus = analyzeActivity(data.steps);
  const hydrationStatus = analyzeHydration(data.waterGlasses);
  const bloodPressureStatus = analyzeBloodPressure(data.bloodPressure, data.bloodPressureStatus);
  const heartRateStatus = analyzeHeartRate(data.heartRate, data.heartRateStatus);

  const notes = [
    bmiStatus !== "Belum ada data" ? `BMI Anda termasuk ${bmiStatus.toLowerCase()}.` : "BMI belum bisa dihitung karena data tinggi dan berat belum lengkap.",
    activityStatus !== "Belum ada data" ? `Aktivitas harian Anda cenderung ${activityStatus.toLowerCase()}.` : "Data langkah harian belum cukup untuk dinilai.",
    hydrationStatus !== "Belum ada data" ? `Hidrasi Anda ${hydrationStatus.toLowerCase()}.` : "Data minum belum cukup untuk memberi saran hidrasi.",
    bloodPressureStatus !== "Belum ada data" ? `Tekanan darah Anda terdeteksi ${bloodPressureStatus.toLowerCase()}.` : "Data tekanan darah belum tersedia.",
    heartRateStatus !== "Belum ada data" ? `Detak jantung Anda terdeteksi ${heartRateStatus.toLowerCase()}.` : "Data detak jantung belum tersedia.",
  ];

  let overallStatus: EducationHealthAnalysis["overallStatus"] = "Baik";
  let overallRecommendation = "Pertahankan kebiasaan sehat, pantau data secara rutin, dan jaga pola hidup seimbang.";

  const riskIndicators = [bmiStatus, activityStatus, hydrationStatus, bloodPressureStatus, heartRateStatus].filter(
    (item) => item !== "Belum ada data"
  );
  if (riskIndicators.some((item) => item === "Obesitas" || item === "Tinggi" || item === "Rendah" || item === "Sangat kurang aktif" || item === "Perlu ditambah")) {
    overallStatus = "Perlu perhatian";
    overallRecommendation =
      "Coba perbaiki bagian yang paling menonjol dulu, misalnya gerak harian, minum air, atau porsi makan, lalu pantau ulang secara bertahap.";
  } else if (riskIndicators.some((item) => item === "Overweight" || item === "Kurang aktif" || item === "Waspada")) {
    overallStatus = "Perlu dipantau";
    overallRecommendation =
      "Ada beberapa hal yang sebaiknya dipantau lebih sering, jadi coba jaga pola makan, aktivitas, dan istirahat secara lebih konsisten.";
  }

  const ageValue = normalizeAge(data.age);
  const healthSummary = formatSentence([
    `BMI ${bmiValue > 0 ? bmiValue.toFixed(1) : "-" } (${bmiStatus.toLowerCase()})`,
    data.bloodPressure ? `tekanan darah ${data.bloodPressure} (${bloodPressureStatus.toLowerCase()})` : "",
    data.heartRate ? `detak jantung ${formatNumber(data.heartRate)} bpm (${heartRateStatus.toLowerCase()})` : "",
    data.steps ? `${formatNumber(data.steps)} langkah hari ini (${activityStatus.toLowerCase()})` : "",
    data.waterGlasses ? `${formatNumber(data.waterGlasses)} gelas air (${hydrationStatus.toLowerCase()})` : "",
  ]);

  const hasPredictionInput =
    Number(ageValue) > 0 &&
    Number(data.height || 0) > 0 &&
    Number(data.weight || 0) > 0 &&
    bmiValue > 0 &&
    Number(data.heartRate || 0) > 0 &&
    parseBloodPressure(data.bloodPressure).systolic > 0 &&
    parseBloodPressure(data.bloodPressure).diastolic > 0 &&
    Number(data.steps || 0) >= 0;

  if (hasPredictionInput) {
    try {
      const prediction = predictHealthStatus({
        age: Number(ageValue),
        gender:
          String(data.gender || "")
            .toLowerCase()
            .includes("laki") || String(data.gender || "").toLowerCase().includes("male") || String(data.gender || "").trim() === "1"
            ? 1
            : 0,
        height_cm: Number(data.height || 0),
        weight_kg: Number(data.weight || 0),
        bmi: bmiValue,
        heart_rate: Number(data.heartRate || 0),
        systolic_bp: parseBloodPressure(data.bloodPressure).systolic,
        diastolic_bp: parseBloodPressure(data.bloodPressure).diastolic,
        steps: Number(data.steps || 0),
      });
      overallStatus = prediction.healthStatusLabel.toLowerCase().includes("sehat") ? "Baik" : overallStatus;
      overallRecommendation = prediction.recommendation;
    } catch {
      // Tetap pakai analisis sederhana jika model prediksi belum siap.
    }
  }

  return {
    bmiValue,
    bmiStatus,
    activityStatus,
    hydrationStatus,
    bloodPressureStatus,
    heartRateStatus,
    overallStatus,
    overallRecommendation,
    educationalNotes: notes,
  };
}

export function buildEducationContext(data: EducationSourceData): EducationContext {
  const analysis = analyzeHealthParameters(data);
  const bmiText = analysis.bmiValue > 0 ? analysis.bmiValue.toFixed(1) : "-";
  const bloodPressureText = normalizeText(data.bloodPressure);
  const heartRateText = data.heartRate && data.heartRate > 0 ? `${formatNumber(data.heartRate)} bpm` : "-";
  const activityText = data.activitySummary?.trim() || (data.steps && data.steps > 0 ? `${formatNumber(data.steps)} langkah hari ini` : "-");
  const mealText = data.mealSummary?.trim() || (data.mealCalories && data.mealCalories > 0 ? `${formatNumber(data.mealCalories)} kkal` : "-");
  const hydrationText = data.hydrationSummary?.trim() || (data.waterGlasses && data.waterGlasses > 0 ? `${formatNumber(data.waterGlasses)} gelas air` : "-");

  return {
    educationContext: {
      patientName: data.patientName?.trim() || "Pasien",
      age: normalizeAge(data.age),
      gender: normalizeText(data.gender),
      height: data.height && data.height > 0 ? `${formatNumber(data.height)} cm` : "-",
      weight: data.weight && data.weight > 0 ? `${formatNumber(data.weight)} kg` : "-",
      location: normalizeText(data.location),
      healthSummary: formatSentence([
        ...analysis.educationalNotes,
        `Status keseluruhan: ${analysis.overallStatus.toLowerCase()}.`,
      ]),
      bloodPressure: bloodPressureText,
      bloodPressureStatus: analysis.bloodPressureStatus,
      heartRate: heartRateText,
      heartRateStatus: analysis.heartRateStatus,
      activitySummary: activityText,
      mealSummary: mealText,
      hydrationSummary: hydrationText,
    },
    analysis,
    promptSummary: formatSentence([
      `BMI ${bmiText} (${analysis.bmiStatus.toLowerCase()})`,
      `aktivitas ${analysis.activityStatus.toLowerCase()}`,
      `hidrasi ${analysis.hydrationStatus.toLowerCase()}`,
      `tekanan darah ${analysis.bloodPressureStatus.toLowerCase()}`,
      `detak jantung ${analysis.heartRateStatus.toLowerCase()}`,
    ]),
  };
}

export function generateEducationPrompt(question: string, healthContext: EducationContext) {
  const topic = analyzeEducationTopic(question);
  return `
Anda adalah asisten edukasi kesehatan untuk aplikasi monitoring IoT.
Jawaban harus singkat, hangat, sopan, dan berbasis data kesehatan terbaru pengguna.
Jangan memberi diagnosis pasti dan jangan menggantikan dokter.

Fokus topik:
- Topik terdeteksi: ${topic.label}
- Fokus: ${topic.focus}
- Arahan: ${topic.guidance}

Konteks kesehatan:
  - Nama: ${healthContext.educationContext.patientName}
  - Usia: ${healthContext.educationContext.age}
  - Jenis kelamin: ${healthContext.educationContext.gender}
  - Tinggi badan: ${healthContext.educationContext.height}
  - Berat badan: ${healthContext.educationContext.weight}
  - Lokasi: ${healthContext.educationContext.location}
  - Ringkasan kesehatan: ${healthContext.educationContext.healthSummary}
  - Tekanan darah: ${healthContext.educationContext.bloodPressure}
  - Status tekanan darah: ${healthContext.educationContext.bloodPressureStatus}
  - Detak jantung: ${healthContext.educationContext.heartRate}
  - Status detak jantung: ${healthContext.educationContext.heartRateStatus}
  - Aktivitas: ${healthContext.educationContext.activitySummary}
  - Pola makan: ${healthContext.educationContext.mealSummary}
  - Hidrasi: ${healthContext.educationContext.hydrationSummary}

Analisis cepat:
- BMI: ${healthContext.analysis.bmiValue > 0 ? healthContext.analysis.bmiValue.toFixed(1) : "-"}
- Status BMI: ${healthContext.analysis.bmiStatus}
- Status aktivitas: ${healthContext.analysis.activityStatus}
- Status hidrasi: ${healthContext.analysis.hydrationStatus}
- Status keseluruhan: ${healthContext.analysis.overallStatus}

Aturan jawaban:
- Gunakan bahasa Indonesia yang natural dan akrab.
- Jawab inti pertanyaan dulu, lalu beri saran praktis singkat.
- Maksimal 2 sampai 4 kalimat pendek.
- Kalau data kurang, bilang jujur dan minta data yang dibutuhkan dengan lembut.
- Kalau ada tanda bahaya, anjurkan ke tenaga medis segera.

Pertanyaan:
${question}
`.trim();
}

export async function sendEducationQuestionToAI(input: {
  question: string;
  healthContext: EducationContext;
  history: ChatHistoryEntry[];
  onUpdate?: (partialText: string) => void;
}) {
  const prompt = generateEducationPrompt(input.question, input.healthContext);
  const response = await generateEducationReply({
    question: input.question,
    context: input.healthContext,
    history: input.history,
    onUpdate: input.onUpdate,
  });

  return {
    answer: response,
    topic: analyzeEducationTopic(input.question),
    analysis: input.healthContext.analysis,
    prompt,
  };
}

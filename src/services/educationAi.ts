import { analyzeEducationTopic, generateEducationReply, type EducationWebSource } from "./educationResponder";
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

const parseSleepHoursFromSummary = (value?: string) => {
  const normalized = String(value || "").toLowerCase();
  if (!normalized || normalized === "-") return 0;

  const hoursMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:jam|j|h)/);
  if (hoursMatch) return Number(hoursMatch[1].replace(",", ".")) || 0;

  const compactMatch = normalized.match(/(\d+)\s*j(?:\s*(\d+)\s*m)?/);
  if (compactMatch) {
    const hours = Number(compactMatch[1]) || 0;
    const minutes = Number(compactMatch[2]) || 0;
    return hours + minutes / 60;
  }

  const numberMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
  return numberMatch ? Number(numberMatch[1].replace(",", ".")) || 0 : 0;
};

const analyzeSleep = (sleepHours?: number, sleepSummary?: string): EducationHealthAnalysis["sleepStatus"] => {
  const normalizedHours =
    Number.isFinite(sleepHours || 0) && (sleepHours || 0) > 0 ? Number(sleepHours) : parseSleepHoursFromSummary(sleepSummary);
  if (!normalizedHours || normalizedHours <= 0) return "Belum ada data";
  if (normalizedHours < 6) return "Kurang";
  if (normalizedHours > 9) return "Berlebih";
  return "Cukup";
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
  const sleepStatus = analyzeSleep(data.sleepHours, data.sleepSummary);
  const bloodPressureStatus = analyzeBloodPressure(data.bloodPressure, data.bloodPressureStatus);
  const heartRateStatus = analyzeHeartRate(data.heartRate, data.heartRateStatus);

  const notes = [
    bmiStatus !== "Belum ada data" ? `BMI Anda termasuk ${bmiStatus.toLowerCase()}.` : "BMI belum bisa dihitung karena data tinggi dan berat belum lengkap.",
    activityStatus !== "Belum ada data" ? `Aktivitas harian Anda cenderung ${activityStatus.toLowerCase()}.` : "Data langkah harian belum cukup untuk dinilai.",
    hydrationStatus !== "Belum ada data" ? `Hidrasi Anda ${hydrationStatus.toLowerCase()}.` : "Data minum belum cukup untuk memberi saran hidrasi.",
    sleepStatus !== "Belum ada data" ? `Pola tidur Anda ${sleepStatus.toLowerCase()}.` : "Data tidur belum cukup untuk dinilai.",
    bloodPressureStatus !== "Belum ada data" ? `Tekanan darah Anda terdeteksi ${bloodPressureStatus.toLowerCase()}.` : "Data tekanan darah belum tersedia.",
    heartRateStatus !== "Belum ada data" ? `Detak jantung Anda terdeteksi ${heartRateStatus.toLowerCase()}.` : "Data detak jantung belum tersedia.",
  ];

  let overallStatus: EducationHealthAnalysis["overallStatus"] = "Baik";
  let overallRecommendation = "Pertahankan kebiasaan sehat, pantau data secara rutin, dan jaga pola hidup seimbang.";

  const riskIndicators = [bmiStatus, activityStatus, hydrationStatus, sleepStatus, bloodPressureStatus, heartRateStatus].filter(
    (item) => item !== "Belum ada data"
  );
  if (riskIndicators.some((item) => item === "Obesitas" || item === "Tinggi" || item === "Rendah" || item === "Sangat kurang aktif" || item === "Perlu ditambah")) {
    overallStatus = "Perlu perhatian";
    overallRecommendation =
      "Coba perbaiki bagian yang paling menonjol dulu, misalnya gerak harian, minum air, atau porsi makan, lalu pantau ulang secara bertahap.";
  } else if (riskIndicators.some((item) => item === "Overweight" || item === "Kurang aktif" || item === "Waspada" || item === "Kurang" || item === "Berlebih")) {
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
    sleepStatus !== "Belum ada data" ? `tidur ${formatNumber(Number(data.sleepHours || parseSleepHoursFromSummary(data.sleepSummary)), 1)} jam (${sleepStatus.toLowerCase()})` : "",
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
    sleepStatus,
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
  const recentHistorySummary = data.recentHistorySummary?.trim() || "";
  const recentTrendSummary = data.recentTrendSummary?.trim() || "";
  const recentMeasurementSummary = data.recentMeasurementSummary?.trim() || "";
  const recentActivitySummary = data.recentActivitySummary?.trim() || "";
  const recentNutritionSummary = data.recentNutritionSummary?.trim() || "";
  const sleepSummary = data.sleepSummary?.trim() || "";
  const sleepHours = Number(data.sleepHours || 0);
  const sleepStatus = data.sleepStatus?.trim() || analyzeSleep(sleepHours, sleepSummary);
  const sleepHistorySummary = data.sleepHistorySummary?.trim() || "";
  const recentBloodPressureSummary = data.recentBloodPressureSummary?.trim() || "";
  const recentStepSummary = data.recentStepSummary?.trim() || "";
  const recentHydrationSummary = data.recentHydrationSummary?.trim() || "";
  const recentWeightBmiSummary = data.recentWeightBmiSummary?.trim() || "";
  const recentSleepComparisonSummary = data.recentSleepComparisonSummary?.trim() || "";
  const recentHeartRateSummary = data.recentHeartRateSummary?.trim() || "";
  const prioritySummary = data.prioritySummary?.trim() || "";
  const bloodPressureText = normalizeText(data.bloodPressure);
  const heartRateText = data.heartRate && data.heartRate > 0 ? `${formatNumber(data.heartRate)} bpm` : "-";
  const activityText = data.activitySummary?.trim() || recentStepSummary || (data.steps && data.steps > 0 ? `${formatNumber(data.steps)} langkah hari ini` : "-");
  const mealText = data.mealSummary?.trim() || (data.mealCalories && data.mealCalories > 0 ? `${formatNumber(data.mealCalories)} kkal` : "-");
  const hydrationText = data.hydrationSummary?.trim() || recentHydrationSummary || (data.waterGlasses && data.waterGlasses > 0 ? `${formatNumber(data.waterGlasses)} gelas air` : "-");
  const sleepText = sleepSummary || (sleepHours > 0 ? `${formatNumber(sleepHours, 1)} jam` : "-");

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
        recentTrendSummary ? `Tren terbaru: ${recentTrendSummary}` : "",
        recentMeasurementSummary ? `Riwayat pengukuran: ${recentMeasurementSummary}` : "",
        recentActivitySummary ? `Riwayat aktivitas: ${recentActivitySummary}` : "",
        recentNutritionSummary ? `Riwayat nutrisi: ${recentNutritionSummary}` : "",
        recentBloodPressureSummary ? `Riwayat tekanan darah: ${recentBloodPressureSummary}` : "",
        recentStepSummary ? `Riwayat langkah: ${recentStepSummary}` : "",
        recentHydrationSummary ? `Riwayat hidrasi: ${recentHydrationSummary}` : "",
        recentWeightBmiSummary ? `Perbandingan berat/BMI: ${recentWeightBmiSummary}` : "",
        recentSleepComparisonSummary ? `Perbandingan tidur: ${recentSleepComparisonSummary}` : "",
        recentHeartRateSummary ? `Perbandingan detak jantung: ${recentHeartRateSummary}` : "",
        sleepSummary ? `Pola tidur: ${sleepSummary}` : "",
        sleepHistorySummary ? `Riwayat tidur: ${sleepHistorySummary}` : "",
        prioritySummary ? `Prioritas: ${prioritySummary}` : "",
        `Status keseluruhan: ${analysis.overallStatus.toLowerCase()}.`,
      ]),
      recentHistorySummary,
      recentTrendSummary,
      prioritySummary,
      recentMeasurementSummary,
      recentActivitySummary,
      recentNutritionSummary,
      sleepSummary,
      sleepHours: sleepText,
      sleepStatus,
      sleepHistorySummary,
      recentBloodPressureSummary,
      recentStepSummary,
      recentHydrationSummary,
      recentWeightBmiSummary,
      recentSleepComparisonSummary,
      recentHeartRateSummary,
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
    `tidur ${sleepStatus.toLowerCase()}`,
    recentBloodPressureSummary ? `tekanan darah riwayat ${recentBloodPressureSummary}` : "",
    recentStepSummary ? `langkah riwayat ${recentStepSummary}` : "",
    recentHydrationSummary ? `hidrasi riwayat ${recentHydrationSummary}` : "",
    recentWeightBmiSummary ? `berat bmi riwayat ${recentWeightBmiSummary}` : "",
    recentSleepComparisonSummary ? `tidur riwayat ${recentSleepComparisonSummary}` : "",
    recentHeartRateSummary ? `detak jantung riwayat ${recentHeartRateSummary}` : "",
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
Kalau pertanyaan di luar topik kesehatan, tolak dengan sopan dan arahkan kembali ke topik kesehatan.
Kalau pertanyaan masih seputar kesehatan, prioritaskan parameter pengguna yang tersedia sebagai dasar utama.
Jika data kurang, akui dengan jujur dan minta parameter yang dibutuhkan tanpa mengarang data.
Jika ada rujukan web, prioritaskan sumber resmi seperti WHO, NIH, CDC, dan Mayo Clinic.
Untuk pertanyaan umum seperti "bagaimana kesehatan saya", jelaskan status keseluruhan, data yang paling berpengaruh, data yang masih kurang, dan 1-2 langkah praktis yang bisa dilakukan hari ini.

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
  - Jenis kelamin dipakai sebagai konteks tambahan bila relevan, terutama untuk penjelasan BMI, komposisi tubuh, dan saran umum yang aman: ${healthContext.educationContext.gender}
  - Tekanan darah: ${healthContext.educationContext.bloodPressure}
  - Status tekanan darah: ${healthContext.educationContext.bloodPressureStatus}
  - Detak jantung: ${healthContext.educationContext.heartRate}
  - Status detak jantung: ${healthContext.educationContext.heartRateStatus}
  - Aktivitas: ${healthContext.educationContext.activitySummary}
  - Pola makan: ${healthContext.educationContext.mealSummary}
  - Hidrasi: ${healthContext.educationContext.hydrationSummary}
  - Riwayat tekanan darah: ${healthContext.educationContext.recentBloodPressureSummary || "-"}
  - Riwayat langkah: ${healthContext.educationContext.recentStepSummary || "-"}
  - Riwayat hidrasi: ${healthContext.educationContext.recentHydrationSummary || "-"}
  - Perbandingan berat/BMI: ${healthContext.educationContext.recentWeightBmiSummary || "-"}
  - Perbandingan tidur: ${healthContext.educationContext.recentSleepComparisonSummary || "-"}
  - Perbandingan detak jantung: ${healthContext.educationContext.recentHeartRateSummary || "-"}
  - Pola tidur: ${healthContext.educationContext.sleepSummary || "-"}
  - Durasi tidur: ${healthContext.educationContext.sleepHours || "-"}
  - Status tidur: ${healthContext.educationContext.sleepStatus || "-"}
  - Riwayat tidur: ${healthContext.educationContext.sleepHistorySummary || "-"}

Analisis cepat:
- BMI: ${healthContext.analysis.bmiValue > 0 ? healthContext.analysis.bmiValue.toFixed(1) : "-"}
- Status BMI: ${healthContext.analysis.bmiStatus}
- Status aktivitas: ${healthContext.analysis.activityStatus}
- Status hidrasi: ${healthContext.analysis.hydrationStatus}
- Status tidur: ${healthContext.analysis.sleepStatus}
- Status keseluruhan: ${healthContext.analysis.overallStatus}
- Ringkasan tekanan darah riwayat: ${healthContext.educationContext.recentBloodPressureSummary || "-"}
- Ringkasan langkah riwayat: ${healthContext.educationContext.recentStepSummary || "-"}
- Ringkasan hidrasi riwayat: ${healthContext.educationContext.recentHydrationSummary || "-"}
- Ringkasan berat/BMI riwayat: ${healthContext.educationContext.recentWeightBmiSummary || "-"}
- Ringkasan tidur riwayat: ${healthContext.educationContext.recentSleepComparisonSummary || "-"}
- Ringkasan detak jantung riwayat: ${healthContext.educationContext.recentHeartRateSummary || "-"}
- Riwayat terbaru: ${healthContext.educationContext.recentHistorySummary || "-"}
- Tren terbaru: ${healthContext.educationContext.recentTrendSummary || "-"}
- Riwayat pengukuran: ${healthContext.educationContext.recentMeasurementSummary || "-"}
- Riwayat aktivitas: ${healthContext.educationContext.recentActivitySummary || "-"}
- Riwayat nutrisi: ${healthContext.educationContext.recentNutritionSummary || "-"}
- Pola tidur: ${healthContext.educationContext.sleepSummary || "-"}
- Riwayat tidur: ${healthContext.educationContext.sleepHistorySummary || "-"}
- Prioritas parameter: ${healthContext.educationContext.prioritySummary || "-"}

Aturan jawaban:
- Gunakan bahasa Indonesia yang natural dan akrab.
- Jawab inti pertanyaan dulu, lalu beri saran praktis singkat.
- Maksimal 2 sampai 4 kalimat pendek.
- Jika pertanyaannya umum tentang kondisi kesehatan, boleh buat jawaban sedikit lebih panjang agar terasa detail dan peka konteks.
- Bandingkan data terbaru dengan riwayat sebelumnya bila ada perubahan yang terlihat.
- Jadikan riwayat data sebagai dasar utama, bukan cuma angka terakhir.
- Mulai dari prioritas parameter yang paling berisiko atau paling berubah.
- Kalau pertanyaan umum seperti "bagaimana kondisi saya hari ini", prioritaskan perubahan hari ini vs kemarin dan mulai dari parameter yang paling menonjol berubah.
- Gunakan jenis kelamin sebagai konteks tambahan bila relevan, tetapi jangan membuat asumsi tanpa data.
- Sebutkan juga parameter lain yang relevan seperti detak jantung, tekanan darah, hidrasi, langkah, atau BMI jika ada perubahan yang jelas.
- Kalau pola tidur tersedia, sebutkan status tidur dan hubungkan dengan energi, aktivitas, atau parameter lain bila relevan.
- Kalau data kurang, bilang jujur dan minta data yang dibutuhkan dengan lembut.
- Jika ada rujukan web, tampilkan hanya sumber resmi seperti WHO, NIH, CDC, dan Mayo Clinic.
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
    answer: response.answer,
    topic: analyzeEducationTopic(input.question),
    analysis: input.healthContext.analysis,
    prompt,
    grounded: response.grounded,
    sources: response.sources as EducationWebSource[],
    searchQueries: response.searchQueries,
    searchEntryPointHtml: response.searchEntryPointHtml,
  };
}

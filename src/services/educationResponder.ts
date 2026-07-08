import type { EducationContext } from "../types/education";

type ChatHistoryEntry = {
  role: "assistant" | "user";
  text: string;
};

type EducationTopic =
  | "tekanan_darah"
  | "detak_jantung"
  | "bmi_berat"
  | "aktivitas"
  | "pola_makan"
  | "hidrasi"
  | "pola_tidur"
  | "umum";

type TopicAnalysis = {
  topic: EducationTopic;
  label: string;
  focus: string;
  guidance: string;
};

type GenerateEducationReplyInput = {
  question: string;
  context: EducationContext;
  history: ChatHistoryEntry[];
  onUpdate?: (partialText: string) => void;
};

export type EducationWebSource = {
  title: string;
  uri: string;
  domain?: string;
};

type GroundingMetadataLike = {
  searchEntryPoint?: {
    renderedContent?: string;
  };
  groundingChunks?: Array<{
    web?: {
      title?: string;
      uri?: string;
      domain?: string;
    };
  }>;
  webSearchQueries?: string[];
};

const HEALTH_CONTEXT_KEYWORDS = [
  "kesehatan",
  "edukasi kesehatan",
  "tekanan darah",
  "tensi",
  "hipertensi",
  "hipotensi",
  "mmhg",
  "sistolik",
  "diastolik",
  "detak jantung",
  "denyut",
  "nadi",
  "bpm",
  "bmi",
  "berat badan",
  "tinggi badan",
  "indeks massa tubuh",
  "aktivitas",
  "olahraga",
  "langkah",
  "jalan kaki",
  "lari",
  "sepeda",
  "makan",
  "makanan",
  "gizi",
  "nutrisi",
  "kalori",
  "serat",
  "protein",
  "karbo",
  "lemak",
  "hidrasi",
  "air",
  "minum",
  "dehidrasi",
  "tidur",
  "insomnia",
  "demam",
  "batuk",
  "pilek",
  "flu",
  "pusing",
  "mual",
  "muntah",
  "diare",
  "nyeri",
  "lelah",
  "capek",
  "stres",
  "cemas",
  "obat",
  "gejala",
  "keluhan",
  "dokter",
  "rumah sakit",
];

const FOLLOW_UP_MARKERS = ["itu", "terus", "lalu", "bagaimana", "gimana", "kenapa", "kalau", "jadi", "apakah", "seperti apa"];

const GENERAL_HEALTH_KEYWORDS = [
  "bagaimana kesehatan saya",
  "kesehatan saya",
  "bagaimana kondisi saya",
  "kondisi saya hari ini",
  "status kesehatan saya",
  "sehatkah saya",
  "gimana kesehatan saya",
  "bagaimana keadaan saya",
];

const REFUSAL_MESSAGE =
  "Maaf, saya hanya bisa membantu percakapan seputar kesehatan. Kalau mau, kirim pertanyaan tentang gejala, pola makan, aktivitas, hidrasi, BMI, atau tekanan darah, lalu saya bantu jelaskan dengan bahasa yang sederhana.";

const OFFICIAL_SOURCE_DOMAINS = ["who.int", "nih.gov", "cdc.gov", "mayoclinic.org"];

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  }
};

const isOfficialSource = (value: string) => {
  const hostname = getHostname(value);
  return OFFICIAL_SOURCE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
};

const normalizeSourceTitle = (value?: string) => value?.trim() || "Sumber web";

const extractGroundingSources = (metadata?: GroundingMetadataLike) => {
  const seen = new Set<string>();
  return (metadata?.groundingChunks || [])
    .map<EducationWebSource | null>((chunk) => {
      const web = chunk.web;
      const uri = web?.uri?.trim() || "";
      if (!uri || seen.has(uri) || !isOfficialSource(web?.domain || uri)) return null;
      seen.add(uri);
      return {
        title: normalizeSourceTitle(web?.title || web?.domain),
        uri,
        domain: web?.domain?.trim() || undefined,
      };
    })
    .filter((source): source is EducationWebSource => source !== null);
};

const GREETING_KEYWORDS = [
  "halo",
  "hallo",
  "hai",
  "hi",
  "hey",
  "pagi",
  "siang",
  "sore",
  "malam",
  "assalamualaikum",
  "assalamu'alaikum",
  "assalamu alaikum",
];

const isGreetingQuestion = (question: string) => {
  const normalized = question.toLowerCase().trim();
  if (!normalized) return false;
  return GREETING_KEYWORDS.some((keyword) => normalized === keyword || normalized.startsWith(`${keyword} `) || normalized.endsWith(` ${keyword}`));
};

const buildGreetingReply = (question: string, context: EducationContext) => {
  const name = context.educationContext.patientName?.trim();
  const namePart = name && name !== "Pasien" ? `, ${name}` : "";
  const lowerQuestion = question.toLowerCase();
  const salutation =
    lowerQuestion.includes("pagi") || lowerQuestion.includes("siang") || lowerQuestion.includes("sore") || lowerQuestion.includes("malam")
      ? question.trim().split(/\s+/)[0]
      : "Halo";

  return [
    `Ringkasan: ${salutation}${namePart}, senang ketemu Anda.`,
    `Data: Saya siap bantu membaca data kesehatan Anda yang tersedia di dashboard, seperti BMI, tekanan darah, detak jantung, aktivitas, hidrasi, dan pola makan.`,
    `Saran: Silakan lanjutkan dengan pertanyaan kesehatan apa pun, misalnya "bagaimana kondisi saya hari ini" atau "apa arti tekanan darah saya?"`,
    `Catatan: Kalau Anda mau, saya juga bisa bantu jelaskan data satu per satu dengan lebih pelan dan detail.`,
  ].join("\n");
};

const TOPIC_KEYWORDS: Array<{ topic: EducationTopic; label: string; keywords: string[]; focus: string; guidance: string }> = [
  {
    topic: "tekanan_darah",
    label: "Tekanan darah",
    keywords: ["tekanan darah", "tensi", "hipertensi", "hipotensi", "mmhg", "sistolik", "diastolik", "darah saya"],
    focus: "Fokus pada angka tekanan darah, statusnya, arti praktisnya, dan langkah yang aman dilakukan hari ini.",
    guidance: "Jelaskan apakah angkanya cenderung aman, perlu dipantau, atau perlu perhatian lebih, lalu beri 1 langkah konkret.",
  },
  {
    topic: "detak_jantung",
    label: "Detak jantung",
    keywords: ["detak jantung", "jantung", "bpm", "nadi", "denyut"],
    focus: "Fokus pada detak jantung, apakah masih wajar, arti statusnya, dan kapan perlu waspada.",
    guidance: "Bandingkan dengan status yang ada, lalu beri saran singkat yang aman dan mudah dilakukan.",
  },
  {
    topic: "bmi_berat",
    label: "BMI dan berat badan",
    keywords: ["bmi", "berat badan", "kurus", "gemuk", "obesitas", "tinggi badan", "bb", "tb", "badan saya"],
    focus: "Fokus pada BMI, berat badan, tinggi badan, dan arah perubahan yang sehat secara bertahap.",
    guidance: "Jawab langsung apakah pengelolaannya perlu dijaga, dinaikkan, atau diturunkan secara bertahap, lalu beri target kecil.",
  },
  {
    topic: "aktivitas",
    label: "Aktivitas",
    keywords: ["aktivitas", "langkah", "jalan", "lari", "sepeda", "olahraga", "gerak", "exercise"],
    focus: "Fokus pada aktivitas harian, jumlah langkah, dan apakah geraknya sudah cukup untuk hari ini.",
    guidance: "Beri saran yang realistis, spesifik, dan mudah dilakukan hari ini.",
  },
  {
    topic: "pola_makan",
    label: "Pola makan",
    keywords: ["makan", "pola makan", "kalori", "gizi", "karbo", "protein", "lemak", "serat", "sarapan", "siang", "malam"],
    focus: "Fokus pada pola makan dan kaitannya dengan kondisi kesehatan yang ditanyakan.",
    guidance: "Gunakan bahasa yang akrab, sebutkan dampaknya, dan beri 1 saran makan yang sederhana.",
  },
  {
    topic: "hidrasi",
    label: "Hidrasi",
    keywords: ["hidrasi", "minum", "air", "dehidrasi", "gelas air", "minum air"],
    focus: "Fokus pada asupan air dan apakah jumlahnya sudah cukup untuk hari ini.",
    guidance: "Beri saran praktis yang ringan, mudah diingat, dan mudah dijalankan hari ini.",
  },
  {
    topic: "pola_tidur",
    label: "Pola tidur",
    keywords: ["tidur", "pola tidur", "jam tidur", "insomnia", "mengantuk", "istirahat"],
    focus: "Fokus pada pola tidur, durasi, kualitas istirahat, dan dampaknya ke kondisi kesehatan hari ini.",
    guidance: "Hubungkan tidur dengan aktivitas, detak jantung, dan kondisi umum bila data pendukung tersedia.",
  },
];

const DEFAULT_TOPIC: TopicAnalysis = {
  topic: "umum",
  label: "Edukasi umum",
  focus: "Fokus pada inti pertanyaan, hubungkan dengan data kesehatan yang paling relevan, dan bantu user mengambil langkah berikutnya.",
  guidance: "Kalau pertanyaannya terlalu umum, jawab dengan arah yang paling berguna lalu beri langkah berikutnya yang jelas dan aman.",
};

export const analyzeEducationTopic = (question: string): TopicAnalysis => {
  const normalized = question.toLowerCase();
  const matched = TOPIC_KEYWORDS.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
  return matched || DEFAULT_TOPIC;
};

const isGeneralHealthQuestion = (question: string) => {
  const normalizedQuestion = question.toLowerCase();
  return GENERAL_HEALTH_KEYWORDS.some((keyword) => normalizedQuestion.includes(keyword));
};

const isHealthRelatedQuestion = (question: string, history: ChatHistoryEntry[]) => {
  const normalizedQuestion = question.toLowerCase();
  if (isGreetingQuestion(question) || isGeneralHealthQuestion(question)) return true;
  if (HEALTH_CONTEXT_KEYWORDS.some((keyword) => normalizedQuestion.includes(keyword))) return true;

  const recentHistoryText = history
    .slice(-4)
    .map((entry) => entry.text.toLowerCase())
    .join(" ");
  const hasRecentHealthContext = HEALTH_CONTEXT_KEYWORDS.some((keyword) => recentHistoryText.includes(keyword));
  const looksLikeFollowUp = FOLLOW_UP_MARKERS.some((marker) => normalizedQuestion.includes(marker));

  return hasRecentHealthContext && looksLikeFollowUp;
};

const isMeaningfulValue = (value?: string) => Boolean(value && value.trim() && value.trim() !== "-");

const compactText = (value: string) => value.trim().replace(/\s+/g, " ");

const collectDataLines = (context: EducationContext) => {
  const analysis = context.analysis;
  return [
    isMeaningfulValue(context.educationContext.bloodPressure)
      ? `Tekanan darah ${context.educationContext.bloodPressure} (${analysis.bloodPressureStatus})`
      : "",
    isMeaningfulValue(context.educationContext.heartRate)
      ? `Detak jantung ${context.educationContext.heartRate} (${analysis.heartRateStatus})`
      : "",
    analysis.bmiValue > 0 ? `BMI ${analysis.bmiValue.toFixed(1)} (${analysis.bmiStatus})` : "",
    isMeaningfulValue(context.educationContext.activitySummary)
      ? `Aktivitas ${context.educationContext.activitySummary} (${analysis.activityStatus})`
      : "",
    isMeaningfulValue(context.educationContext.hydrationSummary)
      ? `Hidrasi ${context.educationContext.hydrationSummary} (${analysis.hydrationStatus})`
      : "",
    isMeaningfulValue(context.educationContext.recentBloodPressureSummary)
      ? `Riwayat tekanan darah ${context.educationContext.recentBloodPressureSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentStepSummary)
      ? `Riwayat langkah ${context.educationContext.recentStepSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentHydrationSummary)
      ? `Riwayat hidrasi ${context.educationContext.recentHydrationSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentMealComparisonSummary)
      ? `Perbandingan pola makan ${context.educationContext.recentMealComparisonSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentHydrationComparisonSummary)
      ? `Perbandingan hidrasi ${context.educationContext.recentHydrationComparisonSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentActivityComparisonSummary)
      ? `Perbandingan aktivitas ${context.educationContext.recentActivityComparisonSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentWeightBmiSummary)
      ? `Perbandingan berat/BMI ${context.educationContext.recentWeightBmiSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentSleepComparisonSummary)
      ? `Perbandingan tidur ${context.educationContext.recentSleepComparisonSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentHeartRateSummary)
      ? `Perbandingan detak jantung ${context.educationContext.recentHeartRateSummary}`
      : "",
    isMeaningfulValue(context.educationContext.recentMostChangedSummary)
      ? `Perubahan paling menonjol ${context.educationContext.recentMostChangedSummary}`
      : "",
    isMeaningfulValue(context.educationContext.mealSummary) ? `Pola makan ${context.educationContext.mealSummary}` : "",
    isMeaningfulValue(context.educationContext.sleepSummary)
      ? `Pola tidur ${context.educationContext.sleepSummary} (${context.educationContext.sleepStatus || "Belum ada data"})`
      : "",
    isMeaningfulValue(context.educationContext.sleepHistorySummary) ? `Riwayat tidur ${context.educationContext.sleepHistorySummary}` : "",
  ].filter(Boolean);
};

const collectMissingData = (context: EducationContext) => {
  return [
    !isMeaningfulValue(context.educationContext.height) || !isMeaningfulValue(context.educationContext.weight)
      ? "tinggi dan berat badan"
      : "",
    !isMeaningfulValue(context.educationContext.bloodPressure) ? "tekanan darah" : "",
    !isMeaningfulValue(context.educationContext.heartRate) ? "detak jantung" : "",
    !isMeaningfulValue(context.educationContext.activitySummary) ? "aktivitas harian" : "",
    !isMeaningfulValue(context.educationContext.hydrationSummary) ? "hidrasi" : "",
    !isMeaningfulValue(context.educationContext.recentBloodPressureSummary) ? "riwayat tekanan darah" : "",
    !isMeaningfulValue(context.educationContext.recentStepSummary) ? "riwayat langkah" : "",
    !isMeaningfulValue(context.educationContext.recentHydrationSummary) ? "riwayat hidrasi" : "",
    !isMeaningfulValue(context.educationContext.recentMealComparisonSummary) ? "perbandingan pola makan" : "",
    !isMeaningfulValue(context.educationContext.recentHydrationComparisonSummary) ? "perbandingan hidrasi" : "",
    !isMeaningfulValue(context.educationContext.recentActivityComparisonSummary) ? "perbandingan aktivitas" : "",
    !isMeaningfulValue(context.educationContext.recentWeightBmiSummary) ? "perbandingan berat dan BMI" : "",
    !isMeaningfulValue(context.educationContext.recentSleepComparisonSummary) ? "perbandingan tidur" : "",
    !isMeaningfulValue(context.educationContext.recentHeartRateSummary) ? "perbandingan detak jantung" : "",
    !isMeaningfulValue(context.educationContext.recentMostChangedSummary) ? "perubahan paling menonjol" : "",
    !isMeaningfulValue(context.educationContext.mealSummary) ? "pola makan" : "",
    !isMeaningfulValue(context.educationContext.sleepSummary) ? "pola tidur" : "",
    !isMeaningfulValue(context.educationContext.sleepHistorySummary) ? "riwayat tidur" : "",
  ].filter(Boolean);
};

const collectHistoryHighlights = (context: EducationContext) =>
  [
    context.educationContext.recentTrendSummary,
    context.educationContext.recentMostChangedSummary,
    context.educationContext.recentMealComparisonSummary,
    context.educationContext.recentHydrationComparisonSummary,
    context.educationContext.recentActivityComparisonSummary,
    context.educationContext.recentWeightBmiSummary,
    context.educationContext.recentSleepComparisonSummary,
    context.educationContext.recentHeartRateSummary,
    context.educationContext.recentHistorySummary,
    context.educationContext.recentMeasurementSummary,
    context.educationContext.recentActivitySummary,
    context.educationContext.recentNutritionSummary,
  ]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];

const buildGuidanceByTopic = (topic: TopicAnalysis, context: EducationContext) => {
  switch (topic.topic) {
    case "tekanan_darah":
      return context.analysis.bloodPressureStatus === "Normal"
        ? "Pertahankan kebiasaan yang sudah baik dan pantau secara rutin."
        : context.analysis.bloodPressureStatus === "Rendah"
          ? "Cukupi cairan, bangun perlahan, dan perhatikan bila sering pusing."
          : context.analysis.bloodPressureStatus === "Waspada" || context.analysis.bloodPressureStatus === "Tinggi"
            ? "Kurangi garam berlebih, istirahat cukup, dan pantau ulang tekanan darah setelah tubuh lebih tenang."
            : "Lengkapi data tekanan darah agar saya bisa memberi edukasi yang lebih tepat.";
    case "detak_jantung":
      return context.analysis.heartRateStatus === "Normal"
        ? "Pertahankan kebiasaan sehat dan pantau jika ada keluhan."
        : context.analysis.heartRateStatus === "Rendah"
          ? "Istirahat cukup dan perhatikan bila sering pusing atau lemas."
          : context.analysis.heartRateStatus === "Tinggi"
            ? "Coba tenangkan diri, istirahat 5-10 menit, lalu pantau ulang bila tetap tinggi."
            : "Lengkapi data detak jantung agar saya bisa memberi saran yang lebih spesifik.";
    case "bmi_berat":
      return context.analysis.bmiStatus === "Normal"
        ? "Pertahankan pola makan dan aktivitas yang sudah seimbang."
        : context.analysis.bmiStatus === "Kurang"
          ? "Tambahkan asupan bergizi secara bertahap dan pantau berat badan."
          : context.analysis.bmiStatus === "Overweight" || context.analysis.bmiStatus === "Obesitas"
            ? "Atur porsi makan, pilih menu lebih seimbang, dan tambah aktivitas rutin."
            : "Lengkapi tinggi dan berat badan agar analisis BMI lebih akurat.";
    case "aktivitas":
      return context.analysis.activityStatus === "Aktif" || context.analysis.activityStatus === "Cukup aktif"
        ? "Pertahankan ritme langkah atau olahraga ringan yang sudah ada."
        : context.analysis.activityStatus === "Kurang aktif"
          ? "Coba tambah 10-15 menit jalan kaki atau pecah aktivitas menjadi sesi singkat."
          : context.analysis.activityStatus === "Sangat kurang aktif"
            ? "Mulai dari target kecil dulu, misalnya berdiri dan berjalan singkat setiap jam."
            : "Lengkapi data aktivitas harian agar saya bisa memberi saran yang lebih tepat.";
    case "pola_makan":
      return context.analysis.overallStatus === "Baik"
        ? "Pertahankan komposisi makan yang seimbang dan jangan lupa protein, serat, serta cairan."
        : "Coba pilih menu yang lebih seimbang dengan karbohidrat, protein, lemak sehat, dan serat.";
    case "hidrasi":
      return context.analysis.hydrationStatus === "Cukup"
        ? "Pertahankan kebiasaan minum air yang sudah baik."
        : context.analysis.hydrationStatus === "Perlu ditambah"
          ? "Tambahkan minum air sedikit demi sedikit sepanjang hari, jangan tunggu sampai haus."
          : "Lengkapi data minum agar saya bisa memberi saran hidrasi yang lebih tepat.";
    case "pola_tidur":
      return isMeaningfulValue(context.educationContext.sleepSummary)
        ? context.educationContext.sleepStatus === "Kurang"
          ? "Tidur Anda masih kurang, jadi coba tambah durasi istirahat dan jaga jam tidur lebih konsisten."
          : context.educationContext.sleepStatus === "Berlebih"
            ? "Tidur Anda cenderung lebih lama dari biasanya, jadi cek apakah ada kelelahan berlebih atau jadwal tidur yang terlalu mundur."
            : "Pertahankan pola tidur yang stabil dan usahakan jam tidur konsisten."
        : "Kalau data tidur ada, saya bisa mengaitkannya dengan kondisi harian Anda dengan lebih tepat.";
    default:
      return context.analysis.overallRecommendation;
  }
};

const buildContextualFallbackReply = (input: Omit<GenerateEducationReplyInput, "onUpdate">, topic: TopicAnalysis) => {
  const analysis = input.context.analysis;
  const dataLines = collectDataLines(input.context);
  const missingData = collectMissingData(input.context);
  const historyHighlights = collectHistoryHighlights(input.context);
  const dataSummary = dataLines.length > 0 ? dataLines.slice(0, 4).join(", ") : "Data kesehatan belum cukup lengkap";
  const historySummary = historyHighlights.length > 0 ? historyHighlights.slice(0, 3).join(" | ") : "Belum ada riwayat tambahan";
  const mentionsToday = /hari ini|today|sekarang/i.test(input.question);
  const asksMostChangedToday = /apa yang paling berubah hari ini|apa yang berubah paling|perubahan paling besar hari ini|yang paling berubah hari ini/i.test(
    input.question.toLowerCase()
  );
  const strongestChangeSummary =
    input.context.educationContext.recentMostChangedSummary ||
    [
      input.context.educationContext.recentActivityComparisonSummary,
      input.context.educationContext.recentMealComparisonSummary,
      input.context.educationContext.recentHydrationComparisonSummary,
      input.context.educationContext.recentWeightBmiSummary,
      input.context.educationContext.recentSleepComparisonSummary,
      input.context.educationContext.recentHeartRateSummary,
      input.context.educationContext.recentBloodPressureSummary,
    ]
      .map((value) => value?.trim())
      .find((value) => Boolean(value)) ||
    "";
  const opening =
    topic.topic === "umum"
      ? mentionsToday
        ? asksMostChangedToday
          ? `Perubahan paling menonjol hari ini adalah ${compactText(strongestChangeSummary || "belum ada perubahan yang cukup jelas untuk disimpulkan")}.`
          : `Berdasarkan data hari ini dan perbandingan dengan riwayat terakhir, kondisi Anda ${analysis.overallStatus.toLowerCase()}.`
        : `Berdasarkan data terbaru dan riwayat yang masuk, kondisi Anda ${analysis.overallStatus.toLowerCase()}.`
      : `Saya tangkap, ini terkait ${topic.label.toLowerCase()} dan saya lihat dari riwayat datanya kondisi Anda ${analysis.overallStatus.toLowerCase()}.`;
  const guidance = compactText(buildGuidanceByTopic(topic, input.context));
  const extras = analysis.overallRecommendation ? compactText(analysis.overallRecommendation) : "";
  const missingNote = missingData.length > 0 ? `Data yang masih kurang: ${missingData.slice(0, 4).join(", ")}.` : "Data pendukung sudah cukup untuk ringkasan dasar.";
  const trendNote = input.context.educationContext.recentTrendSummary
    ? `Tren singkat: ${compactText(input.context.educationContext.recentTrendSummary)}.`
    : "";
  const mostChangedNote =
    asksMostChangedToday && strongestChangeSummary
      ? `Perubahan utama yang terlihat: ${compactText(strongestChangeSummary)}.`
      : "";

  return [
    `Ringkasan: ${opening} ${trendNote || ""} ${mostChangedNote || ""}`.trim(),
    `Data: ${dataSummary}. Riwayat terbaru: ${historySummary}. ${missingNote}`.trim(),
    `Saran: ${guidance}${extras ? ` ${extras}` : ""}`.trim(),
    `Catatan: ${analysis.overallStatus !== "Baik" ? "Kalau ada nyeri dada, sesak, pusing berat, lemas sekali, atau pingsan, segera periksa ke tenaga medis." : "Kalau kondisinya stabil, pertahankan kebiasaan baik dan pantau rutin."}`,
  ].join("\n");
};

const buildEducationPrompt = (input: Omit<GenerateEducationReplyInput, "onUpdate"> & { topic: TopicAnalysis }) => `
Anda adalah asisten edukasi kesehatan untuk aplikasi pemantauan kesehatan.
Jawaban harus hangat, sopan, aman, dan berbasis data kesehatan terbaru pengguna.
Jangan memberi diagnosis pasti dan jangan menggantikan dokter.
Kalau pertanyaan di luar topik kesehatan, jangan menjawab isi pertanyaannya; tolak dengan sopan lalu arahkan kembali ke topik kesehatan.
Kalau pertanyaan masih seputar kesehatan, prioritaskan data pengguna yang tersedia dan riwayat data yang sudah masuk.
Jika data kurang, akui dengan jujur dan minta parameter yang dibutuhkan tanpa mengarang data.
Jika merujuk web, prioritaskan sumber resmi seperti WHO, NIH, CDC, dan Mayo Clinic.
Untuk pertanyaan umum seperti "bagaimana kesehatan saya", jelaskan status keseluruhan, data yang paling berpengaruh, perubahan dari riwayat, data yang masih kurang, dan 1-2 langkah praktis yang bisa dilakukan hari ini.

Fokus topik:
- Topik terdeteksi: ${input.topic.label}
- Fokus: ${input.topic.focus}
- Arahan: ${input.topic.guidance}

Konteks kesehatan:
- Nama: ${input.context.educationContext.patientName}
- Usia: ${input.context.educationContext.age}
- Jenis kelamin: ${input.context.educationContext.gender}
- Gunakan jenis kelamin hanya sebagai konteks tambahan bila relevan, misalnya saat menjelaskan BMI atau komposisi tubuh, dan jangan diulang berlebihan.
- Tinggi badan: ${input.context.educationContext.height}
- Berat badan: ${input.context.educationContext.weight}
- Lokasi: ${input.context.educationContext.location}
- Ringkasan kesehatan: ${input.context.educationContext.healthSummary}
- Riwayat terbaru: ${input.context.educationContext.recentHistorySummary || "-"}
- Tren terbaru: ${input.context.educationContext.recentTrendSummary || "-"}
- Prioritas parameter: ${input.context.educationContext.prioritySummary || "-"}
- Riwayat pengukuran: ${input.context.educationContext.recentMeasurementSummary || "-"}
- Riwayat aktivitas: ${input.context.educationContext.recentActivitySummary || "-"}
- Riwayat nutrisi: ${input.context.educationContext.recentNutritionSummary || "-"}
- Riwayat tekanan darah: ${input.context.educationContext.recentBloodPressureSummary || "-"}
- Riwayat langkah: ${input.context.educationContext.recentStepSummary || "-"}
- Riwayat hidrasi: ${input.context.educationContext.recentHydrationSummary || "-"}
- Perbandingan pola makan: ${input.context.educationContext.recentMealComparisonSummary || "-"}
- Perbandingan hidrasi: ${input.context.educationContext.recentHydrationComparisonSummary || "-"}
- Perbandingan aktivitas: ${input.context.educationContext.recentActivityComparisonSummary || "-"}
- Pola tidur: ${input.context.educationContext.sleepSummary || "-"}
- Durasi tidur: ${input.context.educationContext.sleepHours || "-"}
- Status tidur: ${input.context.educationContext.sleepStatus || "-"}
- Riwayat tidur: ${input.context.educationContext.sleepHistorySummary || "-"}
- Perbandingan berat/BMI: ${input.context.educationContext.recentWeightBmiSummary || "-"}
- Perbandingan tidur: ${input.context.educationContext.recentSleepComparisonSummary || "-"}
- Perbandingan detak jantung: ${input.context.educationContext.recentHeartRateSummary || "-"}
- Perubahan paling menonjol: ${input.context.educationContext.recentMostChangedSummary || "-"}
- Tekanan darah: ${input.context.educationContext.bloodPressure}
- Status tekanan darah: ${input.context.educationContext.bloodPressureStatus}
- Detak jantung: ${input.context.educationContext.heartRate}
- Status detak jantung: ${input.context.educationContext.heartRateStatus}
- Aktivitas: ${input.context.educationContext.activitySummary}
- Pola makan: ${input.context.educationContext.mealSummary}
- Hidrasi: ${input.context.educationContext.hydrationSummary}

Analisis cepat:
- BMI: ${input.context.analysis.bmiValue > 0 ? input.context.analysis.bmiValue.toFixed(1) : "-"}
- Status BMI: ${input.context.analysis.bmiStatus}
- Status aktivitas: ${input.context.analysis.activityStatus}
- Status hidrasi: ${input.context.analysis.hydrationStatus}
- Status tidur: ${input.context.analysis.sleepStatus}
- Status keseluruhan: ${input.context.analysis.overallStatus}
- Ringkasan tekanan darah riwayat: ${input.context.educationContext.recentBloodPressureSummary || "-"}
- Ringkasan langkah riwayat: ${input.context.educationContext.recentStepSummary || "-"}
- Ringkasan hidrasi riwayat: ${input.context.educationContext.recentHydrationSummary || "-"}
- Ringkasan pola makan harian: ${input.context.educationContext.recentMealComparisonSummary || "-"}
- Ringkasan hidrasi harian: ${input.context.educationContext.recentHydrationComparisonSummary || "-"}
- Ringkasan aktivitas harian: ${input.context.educationContext.recentActivityComparisonSummary || "-"}
- Ringkasan berat/BMI riwayat: ${input.context.educationContext.recentWeightBmiSummary || "-"}
- Ringkasan tidur riwayat: ${input.context.educationContext.recentSleepComparisonSummary || "-"}
- Ringkasan detak jantung riwayat: ${input.context.educationContext.recentHeartRateSummary || "-"}
- Ringkasan perubahan paling menonjol: ${input.context.educationContext.recentMostChangedSummary || "-"}

Snapshot data:
- Data yang tersedia: ${collectDataLines(input.context).join(" | ") || "belum ada data yang bisa dipakai"}
- Data yang belum tersedia: ${collectMissingData(input.context).join(", ") || "tidak ada"}
- Riwayat percakapan terakhir: ${input.history.slice(-4).map((entry, index) => `${index + 1}. ${entry.role === "user" ? "Pertanyaan" : "Jawaban"}: ${entry.text.trim().replace(/\s+/g, " ")}`).join(" | ") || "belum ada riwayat"}

Gaya jawaban:
- Gunakan bahasa Indonesia yang natural, akrab, dan menenangkan.
- Buat bahasa terasa personal, seolah sedang bicara langsung dengan satu orang.
- Saat cocok, pakai validasi singkat seperti "Saya tangkap" atau "Saya mengerti".
- Jadikan riwayat data sebagai dasar utama, bukan cuma data terakhir.
- Mulai dari parameter yang paling berisiko atau paling berubah.
- Kalau ada perubahan dari riwayat, sebutkan perubahan itu secara eksplisit.
- Selalu tutup dengan langkah sederhana yang bisa dilakukan hari ini.
- Kalau user bertanya "apa yang paling berubah hari ini", mulai dari ringkasan perubahan paling menonjol lalu tambahkan 1-2 perubahan pendukung yang paling relevan.
- Jika ada rujukan web, tampilkan hanya sumber resmi seperti WHO, NIH, CDC, dan Mayo Clinic.
- Jika ada tanda bahaya, anjurkan segera periksa ke tenaga medis.

Aturan jawaban:
- Jawab inti pertanyaan dulu, lalu beri saran praktis singkat.
- Wajib pakai format berikut dan jangan diubah:
  Ringkasan: ...
  Data: ...
  Saran: ...
  Catatan: ...
- Setiap bagian cukup 1 sampai 2 kalimat pendek.
- Jika pertanyaannya umum tentang kondisi kesehatan, boleh buat jawaban sedikit lebih panjang agar terasa detail dan peka konteks.
- Jangan menulis saran umum yang tidak menyebut data pendukungnya.
- Jangan menyalin teks konteks mentah.
- Kalau jawaban mulai keluar dari konteks kesehatan, kembali ke edukasi kesehatan.
- Urutan penjelasan harus jelas: data yang dipakai, arti data itu, lalu saran yang bisa dilakukan hari ini.
- Kalau user bertanya "apa yang paling berubah hari ini", mulai dari perubahan paling menonjol lalu jelaskan 1-2 perubahan pendukung yang paling relevan.
- Kalau kondisinya baik, tekankan kebiasaan yang perlu dipertahankan.

Pertanyaan:
${input.question}
`.trim();

export async function generateEducationReply(input: GenerateEducationReplyInput) {
  const hasHealthKeyword = HEALTH_CONTEXT_KEYWORDS.some((keyword) => input.question.toLowerCase().includes(keyword));
  if (isGreetingQuestion(input.question) && !hasHealthKeyword && !isGeneralHealthQuestion(input.question)) {
    return {
      answer: buildGreetingReply(input.question, input.context),
      grounded: false,
      sources: [] as EducationWebSource[],
      searchQueries: [] as string[],
      searchEntryPointHtml: "",
    };
  }

  if (!isHealthRelatedQuestion(input.question, input.history)) {
    return {
      answer: REFUSAL_MESSAGE,
      grounded: false,
      sources: [] as EducationWebSource[],
      searchQueries: [] as string[],
      searchEntryPointHtml: "",
    };
  }

  const topic = analyzeEducationTopic(input.question);
  const prompt = buildEducationPrompt({ ...input, topic });
  try {
    const { GoogleAIBackend, getAI, getGenerativeModel } = await import("firebase/ai");
    const { app } = await import("./firebase");
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const educationModel = getGenerativeModel(ai, {
      model: "gemini-2.5-flash",
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.2,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 420,
      },
    });
    const result = await educationModel.generateContentStream(prompt);

    let responseText = "";
    for await (const chunk of result.stream) {
      responseText += chunk.text();
      input.onUpdate?.(responseText.trim());
    }

    const finalResponse = await result.response;
    const groundingMetadata = finalResponse.candidates?.[0]?.groundingMetadata as GroundingMetadataLike | undefined;
    const sources = extractGroundingSources(groundingMetadata);
    const searchQueries = groundingMetadata?.webSearchQueries?.map((query) => query.trim()).filter(Boolean) || [];
    const searchEntryPointHtml = groundingMetadata?.searchEntryPoint?.renderedContent?.trim() || "";
    const cleaned = responseText.trim();
    if (!cleaned || (/(?:Male|Female|Height|Weight)/i.test(cleaned) && cleaned.length < 80)) {
      return {
        answer: buildContextualFallbackReply(input, topic),
        grounded: false,
        sources: [] as EducationWebSource[],
        searchQueries: [] as string[],
        searchEntryPointHtml: "",
      };
    }

    return {
      answer: cleaned,
      grounded: sources.length > 0,
      sources,
      searchQueries,
      searchEntryPointHtml,
    };
  } catch {
    return {
      answer: buildContextualFallbackReply(input, topic),
      grounded: false,
      sources: [] as EducationWebSource[],
      searchQueries: [] as string[],
      searchEntryPointHtml: "",
    };
  }
}

import type { EducationContext, EducationHealthAnalysis } from "../types/education";

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
  "Maaf, saya hanya bisa membantu edukasi seputar kesehatan. Kalau Anda mau, silakan kirim pertanyaan tentang gejala, pola makan, aktivitas, hidrasi, BMI, atau tekanan darah.";

const TOPIC_KEYWORDS: Array<{ topic: EducationTopic; label: string; keywords: string[]; focus: string; guidance: string }> = [
  {
    topic: "tekanan_darah",
    label: "Tekanan darah",
    keywords: ["tekanan darah", "tensi", "hipertensi", "hipotensi", "mmhg", "sistolik", "diastolik", "darah saya"],
    focus: "Fokus pada angka tekanan darah, statusnya, dan langkah sederhana yang bisa dilakukan hari ini.",
    guidance: "Jelaskan apakah angkanya cenderung aman, perlu dipantau, atau perlu perhatian lebih.",
  },
  {
    topic: "detak_jantung",
    label: "Detak jantung",
    keywords: ["detak jantung", "jantung", "bpm", "nadi", "denyut"],
    focus: "Fokus pada detak jantung, apakah masih wajar, dan kapan perlu waspada.",
    guidance: "Bandingkan dengan status yang ada dan beri saran singkat yang terasa praktis.",
  },
  {
    topic: "bmi_berat",
    label: "BMI dan berat badan",
    keywords: ["bmi", "berat badan", "kurus", "gemuk", "obesitas", "tinggi badan", "bb", "tb", "badan saya"],
    focus: "Fokus pada BMI, berat badan, dan tinggi badan kalau relevan.",
    guidance: "Jawab langsung apakah pengelolaannya perlu dijaga, dinaikkan, atau diturunkan secara bertahap.",
  },
  {
    topic: "aktivitas",
    label: "Aktivitas",
    keywords: ["aktivitas", "langkah", "jalan", "lari", "sepeda", "olahraga", "gerak", "exercise"],
    focus: "Fokus pada aktivitas harian, jumlah langkah, dan apakah geraknya sudah cukup.",
    guidance: "Beri saran yang realistis dan mudah dilakukan hari ini.",
  },
  {
    topic: "pola_makan",
    label: "Pola makan",
    keywords: ["makan", "pola makan", "kalori", "gizi", "karbo", "protein", "lemak", "serat", "sarapan", "siang", "malam"],
    focus: "Fokus pada pola makan dan kaitannya dengan kondisi kesehatan yang ditanyakan.",
    guidance: "Gunakan bahasa yang akrab dan beri 1 saran makan yang sederhana.",
  },
  {
    topic: "hidrasi",
    label: "Hidrasi",
    keywords: ["hidrasi", "minum", "air", "dehidrasi", "gelas air", "minum air"],
    focus: "Fokus pada asupan air dan apakah jumlahnya sudah cukup untuk hari ini.",
    guidance: "Beri saran praktis yang ringan dan mudah diingat.",
  },
];

const DEFAULT_TOPIC: TopicAnalysis = {
  topic: "umum",
  label: "Edukasi umum",
  focus: "Fokus pada inti pertanyaan dan hubungkan dengan data kesehatan yang paling relevan.",
  guidance: "Kalau pertanyaannya terlalu umum, jawab dengan arah yang paling berguna lalu beri langkah berikutnya yang jelas.",
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
  const hasCurrentHealthKeyword = HEALTH_CONTEXT_KEYWORDS.some((keyword) => normalizedQuestion.includes(keyword));
  if (hasCurrentHealthKeyword) return true;

  const recentHistoryText = history
    .slice(-4)
    .map((entry) => entry.text.toLowerCase())
    .join(" ");
  const hasRecentHealthContext = HEALTH_CONTEXT_KEYWORDS.some((keyword) => recentHistoryText.includes(keyword));
  const looksLikeFollowUp = FOLLOW_UP_MARKERS.some((marker) => normalizedQuestion.includes(marker));

  return hasRecentHealthContext && looksLikeFollowUp;
};

const formatHistory = (history: ChatHistoryEntry[]) =>
  history
    .slice(-4)
    .map((entry, index) => {
      const roleLabel = entry.role === "user" ? "Pertanyaan user" : "Jawaban asisten";
      return `${index + 1}. ${roleLabel}: ${entry.text}`;
    })
    .join("\n");

const toCompactSentence = (value: string) => value.trim().replace(/\s+/g, " ").replace(/^[-•\d.)\s]+/, "");

const formatMaybeValue = (value: string | number | undefined, fallback = "-") => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? String(value) : fallback;
  }

  const cleaned = String(value || "").trim();
  return cleaned && cleaned !== "-" ? cleaned : fallback;
};

const summarizeHistory = (history: ChatHistoryEntry[]) =>
  history
    .slice(-4)
    .map((entry, index) => {
      const roleLabel = entry.role === "user" ? "Pertanyaan" : "Jawaban";
      return `${index + 1}. ${roleLabel}: ${entry.text.trim().replace(/\s+/g, " ")}`;
    })
    .join(" | ");

const buildDataBasis = (analysis: EducationHealthAnalysis, context: EducationContext) => {
  const items = [
    analysis.bmiValue > 0 ? `BMI ${analysis.bmiValue.toFixed(1)} (${analysis.bmiStatus})` : "",
    context.educationContext.bloodPressure && context.educationContext.bloodPressure !== "-"
      ? `Tekanan darah ${context.educationContext.bloodPressure} (${analysis.bloodPressureStatus})`
      : "",
    context.educationContext.heartRate && context.educationContext.heartRate !== "-"
      ? `Detak jantung ${context.educationContext.heartRate} (${analysis.heartRateStatus})`
      : "",
    context.educationContext.activitySummary && context.educationContext.activitySummary !== "-"
      ? `Aktivitas ${context.educationContext.activitySummary} (${analysis.activityStatus})`
      : "",
    context.educationContext.hydrationSummary && context.educationContext.hydrationSummary !== "-"
      ? `Hidrasi ${context.educationContext.hydrationSummary} (${analysis.hydrationStatus})`
      : "",
    context.educationContext.mealSummary && context.educationContext.mealSummary !== "-"
      ? `Pola makan ${context.educationContext.mealSummary}`
      : "",
  ];

  return items.filter((item) => item.trim() !== "");
};

const isMeaningfulValue = (value?: string) => Boolean(value && value.trim() && value.trim() !== "-");

const buildAvailableDataLines = (analysis: EducationHealthAnalysis, context: EducationContext) => {
  const items = [
    analysis.bmiValue > 0 ? `BMI ${analysis.bmiValue.toFixed(1)} (${analysis.bmiStatus})` : "",
    isMeaningfulValue(context.educationContext.height) ? `Tinggi badan ${context.educationContext.height}` : "",
    isMeaningfulValue(context.educationContext.weight) ? `Berat badan ${context.educationContext.weight}` : "",
    isMeaningfulValue(context.educationContext.bloodPressure)
      ? `Tekanan darah ${context.educationContext.bloodPressure} (${analysis.bloodPressureStatus})`
      : "",
    isMeaningfulValue(context.educationContext.heartRate)
      ? `Detak jantung ${context.educationContext.heartRate} (${analysis.heartRateStatus})`
      : "",
    isMeaningfulValue(context.educationContext.activitySummary)
      ? `Aktivitas ${context.educationContext.activitySummary} (${analysis.activityStatus})`
      : "",
    isMeaningfulValue(context.educationContext.hydrationSummary)
      ? `Hidrasi ${context.educationContext.hydrationSummary} (${analysis.hydrationStatus})`
      : "",
    isMeaningfulValue(context.educationContext.mealSummary) ? `Pola makan ${context.educationContext.mealSummary}` : "",
  ];

  return items.filter(Boolean);
};

const buildMissingDataLines = (context: EducationContext) => {
  const items = [
    !isMeaningfulValue(context.educationContext.height) || !isMeaningfulValue(context.educationContext.weight)
      ? "tinggi dan berat badan"
      : "",
    !isMeaningfulValue(context.educationContext.bloodPressure) ? "tekanan darah" : "",
    !isMeaningfulValue(context.educationContext.heartRate) ? "detak jantung" : "",
    !isMeaningfulValue(context.educationContext.activitySummary) ? "aktivitas harian" : "",
    !isMeaningfulValue(context.educationContext.hydrationSummary) ? "hidrasi" : "",
    !isMeaningfulValue(context.educationContext.mealSummary) ? "pola makan" : "",
  ];

  return items.filter(Boolean);
};

const buildGeneralHealthReply = (input: Omit<GenerateEducationReplyInput, "onUpdate">) => {
  const analysis = input.context.analysis;
  const availableData = buildAvailableDataLines(analysis, input.context);
  const missingData = buildMissingDataLines(input.context);
  const hasAvailableData = availableData.length > 0;
  const keyNote = analysis.educationalNotes.find((note) => note.toLowerCase().includes(analysis.overallStatus.toLowerCase()))
    || analysis.educationalNotes[0]
    || analysis.overallRecommendation;
  const practicalAdvice = analysis.overallRecommendation || "Pertahankan kebiasaan sehat dan pantau data secara rutin.";
  const dataSummary = hasAvailableData
    ? `Data yang dipakai: ${availableData.slice(0, 4).join(", ")}${missingData.length > 0 ? `. Data yang belum ada: ${missingData.slice(0, 3).join(", ")}` : ""}.`
    : `Data yang belum ada membuat penilaian masih terbatas: ${missingData.slice(0, 4).join(", ")}.`;
  const ringkasan = hasAvailableData
    ? `Saya tangkap datanya, dan dari data terbaru yang tersedia status kesehatan Anda saat ini ${analysis.overallStatus.toLowerCase()}.`
    : `Saya mengerti datanya masih belum lengkap, jadi saya belum bisa menilai kondisi Anda secara tajam.`;
  const data = dataSummary;
  const saranPoin = [
    toCompactSentence(practicalAdvice),
    keyNote ? toCompactSentence(keyNote) : "",
    missingData.includes("tinggi dan berat badan") ? "Kalau sempat, lengkapi tinggi dan berat badan ya, supaya saya bisa membaca BMI Anda dengan lebih akurat." : "",
    missingData.includes("tekanan darah") ? "Kalau ada, cek tekanan darah juga ya, supaya saya bisa menyesuaikan saran dengan kondisi Anda." : "",
    missingData.includes("detak jantung") ? "Bila tersedia, tambahkan detak jantung supaya gambaran saya tentang kondisi Anda lebih lengkap." : "",
    missingData.includes("aktivitas harian") ? "Catat langkah harian ya, supaya saya bisa memberi saran aktivitas yang lebih pas dan realistis." : "",
    missingData.includes("hidrasi") ? "Tambahkan data minum kalau ada, supaya saran hidrasi saya tidak terlalu umum." : "",
    missingData.includes("pola makan") ? "Isi ringkasan makan bila sempat, supaya edukasi nutrisi saya lebih relevan buat Anda." : "",
  ].filter(Boolean);
  const saran = saranPoin.slice(0, 3).join(" ");
  const catatan = `Kalau Anda mau, saya bisa bantu baca per data satu per satu dengan pelan-pelan: BMI, tekanan darah, detak jantung, aktivitas, hidrasi, atau pola makan.`;

  return [`Ringkasan: ${ringkasan}`, `Data: ${data}`, `Saran: ${saran}`, `Catatan: ${catatan}`].join("\n");
};

const buildTopicFallbackReply = (input: Omit<GenerateEducationReplyInput, "onUpdate">, topic: TopicAnalysis) => {
  const analysis = input.context.analysis;
  const availableData = buildAvailableDataLines(analysis, input.context);
  const missingData = buildMissingDataLines(input.context);
  const firstData = availableData.slice(0, 2).join(", ");
  const secondData = availableData.slice(2, 4).join(", ");

  if (topic.topic === "aktivitas") {
    const activityData = isMeaningfulValue(input.context.educationContext.activitySummary)
      ? input.context.educationContext.activitySummary
      : "belum ada data aktivitas";
    const activityAdvice =
      analysis.activityStatus === "Aktif" || analysis.activityStatus === "Cukup aktif"
        ? "Pertahankan ritme jalan kaki atau olahraga ringan seperti sekarang, lalu jaga konsistensi tiap hari."
        : analysis.activityStatus === "Kurang aktif"
          ? "Coba tambah 10-15 menit jalan kaki atau pecah aktivitas menjadi beberapa sesi singkat."
          : analysis.activityStatus === "Sangat kurang aktif"
            ? "Mulai dari target kecil dulu, misalnya berdiri dan berjalan singkat setiap jam."
            : "Lengkapi data aktivitas harian agar saya bisa memberi saran yang lebih tepat.";

    return [
      `Ringkasan: Saya tangkap, aktivitas fisik Anda saat ini ${analysis.activityStatus.toLowerCase()}.`,
      `Data: Data yang dipakai: ${activityData}${firstData ? `. Data pendukung lain: ${firstData}` : ""}${secondData ? `. Data tambahan: ${secondData}` : ""}.`,
      `Saran: ${activityAdvice}`,
      `Catatan: ${missingData.includes("aktivitas harian") ? "Kalau Anda kirim jumlah langkah harian atau durasi olahraga, saya bisa membaca aktivitas Anda dengan lebih akurat dan tenang." : "Kalau mau, saya juga bisa bantu lihat apakah ritme aktivitas Anda sudah cukup untuk target kesehatan yang Anda inginkan."}`,
    ].join("\n");
  }

  if (topic.topic === "hidrasi") {
    const hydrationData = isMeaningfulValue(input.context.educationContext.hydrationSummary)
      ? input.context.educationContext.hydrationSummary
      : "belum ada data hidrasi";
    const hydrationAdvice =
      analysis.hydrationStatus === "Cukup"
        ? "Pertahankan kebiasaan minum air yang sudah baik."
        : analysis.hydrationStatus === "Perlu ditambah"
          ? "Tambahkan minum air sedikit demi sedikit sepanjang hari, jangan tunggu sampai haus."
          : "Lengkapi data minum agar saya bisa memberi saran hidrasi yang lebih tepat.";

    return [
      `Ringkasan: Saya tangkap, hidrasi Anda saat ini ${analysis.hydrationStatus.toLowerCase()}.`,
      `Data: Data yang dipakai: ${hydrationData}${firstData ? `. Data pendukung lain: ${firstData}` : ""}${secondData ? `. Data tambahan: ${secondData}` : ""}.`,
      `Saran: ${hydrationAdvice}`,
      `Catatan: ${missingData.includes("hidrasi") ? "Kalau Anda catat jumlah gelas air per hari, saya bisa membaca hidrasi Anda dengan lebih spesifik." : "Saya bisa bantu lihat apakah kebutuhan minum Anda sudah mendekati target harian."}`,
    ].join("\n");
  }

  if (topic.topic === "bmi_berat") {
    const bmiData = analysis.bmiValue > 0 ? `BMI ${analysis.bmiValue.toFixed(1)} (${analysis.bmiStatus})` : "BMI belum tersedia";
    const bmiAdvice =
      analysis.bmiStatus === "Normal"
        ? "Pertahankan pola makan dan aktivitas Anda."
        : analysis.bmiStatus === "Kurang"
          ? "Tambahkan asupan makan bergizi secara bertahap dan pantau berat badan."
          : analysis.bmiStatus === "Overweight" || analysis.bmiStatus === "Obesitas"
            ? "Mulai atur porsi makan, pilih makanan lebih seimbang, dan tambah aktivitas rutin."
            : "Lengkapi tinggi dan berat badan agar analisis BMI lebih akurat.";

    return [
      `Ringkasan: Saya tangkap, berdasarkan BMI yang tersedia kondisi Anda berada pada kategori ${analysis.bmiStatus.toLowerCase()}.`,
      `Data: Data yang dipakai: ${bmiData}${firstData ? `. Data pendukung lain: ${firstData}` : ""}${secondData ? `. Data tambahan: ${secondData}` : ""}.`,
      `Saran: ${bmiAdvice}`,
      `Catatan: Kalau tinggi dan berat badan belum lengkap, penilaian BMI memang belum bisa dibuat secara kuat, jadi tidak apa-apa ya.`,
    ].join("\n");
  }

  if (topic.topic === "tekanan_darah") {
    const bpData = isMeaningfulValue(input.context.educationContext.bloodPressure)
      ? `${input.context.educationContext.bloodPressure} (${analysis.bloodPressureStatus})`
      : "belum ada data tekanan darah";
    const bpAdvice =
      analysis.bloodPressureStatus === "Normal"
        ? "Pertahankan pola hidup yang sudah baik dan pantau secara rutin."
        : analysis.bloodPressureStatus === "Rendah"
          ? "Cukupi cairan, bangun perlahan, dan perhatikan bila sering pusing."
          : analysis.bloodPressureStatus === "Waspada" || analysis.bloodPressureStatus === "Tinggi"
            ? "Kurangi garam berlebih, istirahat cukup, dan pantau ulang tekanan darah."
            : "Lengkapi data tekanan darah agar saya bisa memberi edukasi yang lebih tepat.";

    return [
      `Ringkasan: Saya tangkap, tekanan darah Anda saat ini ${analysis.bloodPressureStatus.toLowerCase()}.`,
      `Data: Data yang dipakai: ${bpData}${firstData ? `. Data pendukung lain: ${firstData}` : ""}${secondData ? `. Data tambahan: ${secondData}` : ""}.`,
      `Saran: ${bpAdvice}`,
      `Catatan: Kalau ada pusing, lemas, nyeri dada, atau sesak, sebaiknya segera periksa ke tenaga medis ya.`,
    ].join("\n");
  }

  if (topic.topic === "detak_jantung") {
    const hrData = isMeaningfulValue(input.context.educationContext.heartRate)
      ? `${input.context.educationContext.heartRate} (${analysis.heartRateStatus})`
      : "belum ada data detak jantung";
    const hrAdvice =
      analysis.heartRateStatus === "Normal"
        ? "Pertahankan kebiasaan sehat dan pantau jika ada keluhan."
        : analysis.heartRateStatus === "Rendah"
          ? "Istirahat cukup dan perhatikan bila sering pusing atau lemas."
          : analysis.heartRateStatus === "Tinggi"
            ? "Coba tenangkan diri, istirahat, dan pantau ulang bila tetap tinggi."
            : "Lengkapi data detak jantung agar saya bisa memberi saran yang lebih spesifik.";

    return [
      `Ringkasan: Saya tangkap, detak jantung Anda saat ini ${analysis.heartRateStatus.toLowerCase()}.`,
      `Data: Data yang dipakai: ${hrData}${firstData ? `. Data pendukung lain: ${firstData}` : ""}${secondData ? `. Data tambahan: ${secondData}` : ""}.`,
      `Saran: ${hrAdvice}`,
      `Catatan: Kalau keluhan berlanjut atau disertai sesak, pusing berat, atau nyeri dada, segera cari bantuan medis ya.`,
    ].join("\n");
  }

  if (topic.topic === "pola_makan") {
    const mealData = isMeaningfulValue(input.context.educationContext.mealSummary)
      ? input.context.educationContext.mealSummary
      : "belum ada data pola makan";
    const mealAdvice =
      analysis.overallStatus === "Baik"
        ? "Pertahankan komposisi makan yang seimbang dan jangan lupa protein, serat, serta cairan."
        : "Coba pilih menu yang lebih seimbang dengan karbohidrat, protein, lemak sehat, dan serat.";

    return [
      `Ringkasan: Saya tangkap, pola makan Anda bisa diarahkan untuk mendukung kondisi kesehatan saat ini.`,
      `Data: Data yang dipakai: ${mealData}${firstData ? `. Data pendukung lain: ${firstData}` : ""}${secondData ? `. Data tambahan: ${secondData}` : ""}.`,
      `Saran: ${mealAdvice}`,
      `Catatan: Kalau Anda ingin, saya bisa bantu susun saran makan dari data aktivitas, hidrasi, dan BMI Anda dengan lebih pelan-pelan.`
    ].join("\n");
  }

  return buildGeneralHealthReply(input);
};

const buildEducationPrompt = (input: Omit<GenerateEducationReplyInput, "onUpdate"> & { topic: TopicAnalysis }) => `
Anda adalah asisten edukasi kesehatan untuk aplikasi pemantauan kesehatan.
Jawaban harus singkat, hangat, sopan, dan berbasis data kesehatan terbaru pengguna.
Jangan memberi diagnosis pasti dan jangan menggantikan dokter.

Fokus topik:
- Topik terdeteksi: ${input.topic.label}
- Fokus: ${input.topic.focus}
- Arahan: ${input.topic.guidance}

Konteks kesehatan:
- Nama: ${input.context.educationContext.patientName}
- Usia: ${input.context.educationContext.age}
- Jenis kelamin: ${input.context.educationContext.gender}
- Tinggi badan: ${input.context.educationContext.height}
- Berat badan: ${input.context.educationContext.weight}
- Lokasi: ${input.context.educationContext.location}
- Ringkasan kesehatan: ${input.context.educationContext.healthSummary}
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
- Status keseluruhan: ${input.context.analysis.overallStatus}

Snapshot data:
- Data yang tersedia: ${buildAvailableDataLines(input.context.analysis, input.context).join(" | ") || "belum ada data yang bisa dipakai"}
- Data yang belum tersedia: ${buildMissingDataLines(input.context).join(", ") || "tidak ada"}
- Riwayat percakapan terakhir: ${summarizeHistory(input.history) || "belum ada riwayat"}

Aturan jawaban:
- Gunakan bahasa Indonesia yang natural dan akrab.
- Gunakan nada hangat, menenangkan, dan empatik seperti konselor kesehatan.
- Buat bahasa terasa personal, seolah sedang bicara langsung dengan satu orang.
- Saat cocok, pakai validasi singkat seperti "Saya tangkap" atau "Saya mengerti".
- Jawab inti pertanyaan dulu, lalu beri saran praktis singkat.
- Format wajib:
  Ringkasan: ...
  Data: ...
  Saran: ...
  Catatan: ...
- Maksimal 2 sampai 4 kalimat pendek per bagian.
- Kalau data kurang, bilang jujur dan minta data yang dibutuhkan dengan lembut.
- Kalau ada tanda bahaya, anjurkan ke tenaga medis segera.
- Jangan menyalin teks konteks mentah.
- Kalau jawaban mulai keluar dari konteks kesehatan, kembali ke edukasi kesehatan.
- Setiap jawaban harus mengacu pada data yang dipakai, lalu jelaskan artinya dengan bahasa yang mudah dipahami.
- Jangan menulis saran umum yang tidak menyebut data pendukungnya.
- Minimal sebut 2 data kesehatan yang relevan jika datanya memang tersedia.
- Urutan penjelasan harus jelas: data yang dipakai, arti data itu, lalu saran yang bisa dilakukan hari ini.
- Jika data masih sedikit, akui keterbatasannya dengan jujur dan arahkan user untuk melengkapi data yang penting.

Pertanyaan:
${input.question}
`.trim();

export async function generateEducationReply(input: GenerateEducationReplyInput) {
  if (!isHealthRelatedQuestion(input.question, input.history)) {
    return REFUSAL_MESSAGE;
  }

  const topic = analyzeEducationTopic(input.question);
  const prompt = buildEducationPrompt({ ...input, topic });
  try {
    const { GoogleAIBackend, getAI, getGenerativeModel } = await import("firebase/ai");
    const { app } = await import("./firebase");
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const educationModel = getGenerativeModel(ai, {
      model: "gemini-flash-latest",
      generationConfig: {
        temperature: 0.2,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 280,
      },
    });
    const result = await educationModel.generateContentStream(prompt);

    let responseText = "";
    for await (const chunk of result.stream) {
      responseText += chunk.text();
      input.onUpdate?.(responseText.trim());
    }

    const cleaned = responseText.trim();
    if (!cleaned || (/(?:Male|Female|Height|Weight)/i.test(cleaned) && cleaned.length < 80)) {
      return buildTopicFallbackReply(input, topic);
    }

    return cleaned;
  } catch {
    return buildTopicFallbackReply(input, topic);
  }
}

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardProps, HealthData } from "../types/Dashboard";
import { storageReady } from "../services/runtime";
import {
  clearMeasurementHistoryForUser,
  getLinkedDeviceForUser,
  getMeasurementHistory,
  linkDeviceToUser,
  markDeviceStreamEntryConsumed,
  publishDeviceDisplayRequest,
  saveMeasurementForUser,
  subscribeDevicePresence,
  subscribeDeviceStream,
  subscribeMeasurementHistory,
  updateMeasurementBmiForUser,
} from "../services/measurements";
import { buildUserProfileDoc, getUserProfile, saveUserProfile, subscribeUserProfile } from "../services/userProfile";
import { getActivitySessionsForUser, saveActivitySessionForUser } from "../services/activitySessions";
import { analyzeEducationTopic, buildEducationContext, sendEducationQuestionToAI } from "../services/aiDoctor";
import { createEducationChatMessageForUser, getEducationChatMessagesForUser, subscribeEducationChatMessagesForUser } from "../services/educationChat";
import { clearMeasurementHistoryEventsForUser, createHistoryEventForUser, getHistoryEventsForUser, subscribeHistoryEventsForUser } from "../services/historyEvents";
import { readStore, writeStore } from "../services/localStore";
import { createReminderForUser, subscribeRemindersForUser, updateReminderForUser } from "../services/reminders";
import {
  getHealthModelMetadata,
  predictHealthStatus,
  saveHealthPredictionForUser,
} from "../services/healthPrediction";
import {
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
  formatLocalWeekdayDate,
  formatLocalDayMonth,
} from "../services/dateTime";
import PageContainer from "./ui/PageContainer";
import AppCard from "./ui/AppCard";
import PrimaryButton from "./ui/PrimaryButton";
import SecondaryButton from "./ui/SecondaryButton";
import SectionTitle from "./ui/SectionTitle";
import BottomNavigation from "./navigation/BottomNavigation";
import type { EducationChatMessageDoc, HistoryEventDoc, MeasurementHistoryDoc, ReminderDoc } from "../types/storage";

const DashboardPage = lazy(() => import("../pages/Dashboard/Dashboard"));
const RiwayatPage = lazy(() => import("../pages/Riwayat/Riwayat"));

const HEALTH_MODEL_METADATA = getHealthModelMetadata();
const LAZY_PAGE_FALLBACK = (
  <div className="rounded-[28px] border border-dashed border-[#dfe6ea] bg-white px-5 py-8 text-sm text-slate-500 shadow-sm">
    Memuat tampilan halaman...
  </div>
);

const CORE_MENU_ITEMS = [
  "Dashboard",
  "Pengukuran Manual",
  "Aktivitas",
  "Pola Makan",
  "Edukasi",
  "Riwayat",
  "Pengingat & Alarm",
  "Pengaturan",
] as const;
type CoreMenuItem = (typeof CORE_MENU_ITEMS)[number];
const MENU_NAV_ITEMS: ReadonlyArray<{
  menu: CoreMenuItem;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}> = [
  { menu: "Dashboard", label: "Dashboard", shortLabel: "Home", icon: "fa-house", description: "Ringkasan kesehatan hari ini" },
  { menu: "Pengukuran Manual", label: "Pengukuran Manual", shortLabel: "Ukur", icon: "fa-ruler-combined", description: "Input data pengukuran mandiri" },
  { menu: "Aktivitas", label: "Aktivitas", shortLabel: "Aktif", icon: "fa-person-walking", description: "Pantau gerak dan langkah harian" },
  { menu: "Pola Makan", label: "Pola Makan", shortLabel: "Makan", icon: "fa-utensils", description: "Catat makan dan energi masuk" },
  { menu: "Edukasi", label: "Edukasi", shortLabel: "Edukasi", icon: "fa-book-medical", description: "Saran edukasi berbasis data" },
  { menu: "Riwayat", label: "Riwayat", shortLabel: "Riwayat", icon: "fa-clock-rotate-left", description: "Lihat hasil per waktu pengukuran" },
  { menu: "Pengingat & Alarm", label: "Pengingat & Alarm", shortLabel: "Ingat", icon: "fa-bell", description: "Atur pengingat kesehatan harian" },
  { menu: "Pengaturan", label: "Pengaturan", shortLabel: "Atur", icon: "fa-gear", description: "Kelola profil dan preferensi akun" },
] as const;
const DEFAULT_DEVICE_ID = "ESP32-S3-UNO-01";
const DEFAULT_DEVICE_WRITE_KEY = "KEY-B48D2CD66FE74190A917";
const RIWAYAT_FILTER_OPTIONS = [
  "Semua",
  "Pengukuran",
  "Sinkronisasi Alat",
  "Aktivitas",
  "Pola Makan",
  "Hidrasi",
] as const;
const MEASUREMENT_DERIVED_HISTORY_SOURCES = new Set(["esp32_s3", "web_manual", "web_sync", "app_mobile"]);
const EDUCATION_CHAT_MESSAGE_LIMIT = 8;
const LEGACY_PARAMETER_HISTORY_TYPES = new Set<HistoryEventDoc["dataType"]>([
  "Tekanan Darah",
  "Detak Jantung",
  "Berat Badan",
  "Tinggi Badan",
]);

type ReminderListItem = ReminderDoc & {
  id: string;
  icon: string;
  color: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript?: string };
  length: number;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionInstanceLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionInstanceLike;

type EditableProfile = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  gender: string;
  age: string;
  birthDate: string;
  bloodType: string;
  location: string;
  height: string;
  weight: string;
};

type ActivityCalibrationStore = {
  strideMultiplier: Record<"Jalan" | "Lari" | "Sepeda", number>;
  lastUpdatedAt: string;
};

const DEFAULT_ACTIVITY_CALIBRATION: ActivityCalibrationStore = {
  strideMultiplier: {
    Jalan: 1,
    Lari: 1,
    Sepeda: 1,
  },
  lastUpdatedAt: "",
};

const getActivityCalibrationStorageKey = (uid: string, email: string) =>
  `sehatai-activity-calibration:${uid || email.trim().toLowerCase() || "guest"}`;

const calculateAgeFromBirthDate = (birthDate: string) => {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age > 0 ? String(age) : "";
};

const formatBirthDateLabel = (value: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatLocalDate(parsed, value);
};

const withUnitOrDash = (value: string, unit: string) => {
  const trimmed = value.trim();
  return trimmed ? `${trimmed} ${unit}` : "-";
};

const getProfileStorageKey = (uid: string, email: string) => `sehatai-profile:${uid || email.trim().toLowerCase() || "guest"}`;

const normalizeProfileText = (value: unknown) => String(value ?? "").trim();

const normalizeProfileNumberText = (value: unknown) =>
  normalizeProfileText(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .replace(/^(\d+)(\.\d?)?.*$/, "$1$2");

const buildDefaultEditableProfile = ({
  initialName,
  userEmail,
  latest,
}: {
  initialName: string;
  userEmail: string;
  latest: HealthData | null;
}): EditableProfile => ({
  fullName: initialName,
  username: "",
  email: userEmail || "",
  phone: "",
  gender: "",
  age: "",
  birthDate: "",
  bloodType: "",
  location: "",
  height: latest?.height && latest.height > 0 ? String(latest.height) : "",
  weight: latest?.weight && latest.weight > 0 ? String(latest.weight) : "",
});

const mergeEditableProfile = (incoming: Partial<EditableProfile> | null | undefined, fallback: EditableProfile): EditableProfile => {
  const birthDate = normalizeProfileText(incoming?.birthDate) || fallback.birthDate;
  return {
    fullName: normalizeProfileText(incoming?.fullName) || fallback.fullName,
    username: normalizeProfileText(incoming?.username) || fallback.username,
    email: normalizeProfileText(incoming?.email) || fallback.email,
    phone: normalizeProfileText(incoming?.phone) || fallback.phone,
    gender: normalizeProfileText(incoming?.gender) || fallback.gender,
    age: birthDate ? calculateAgeFromBirthDate(birthDate) : normalizeProfileText(incoming?.age) || fallback.age,
    birthDate,
    bloodType: normalizeProfileText(incoming?.bloodType) || fallback.bloodType,
    location: normalizeProfileText(incoming?.location) || fallback.location,
    height: normalizeProfileNumberText(incoming?.height) || fallback.height,
    weight: normalizeProfileNumberText(incoming?.weight) || fallback.weight,
  };
};

const readLocalEditableProfile = (storageKey: string, fallback: EditableProfile) =>
  mergeEditableProfile(readStore<Partial<EditableProfile>>(storageKey, {}), fallback);

const writeLocalEditableProfile = (storageKey: string, profile: EditableProfile) => {
  writeStore(storageKey, {
    ...profile,
    age: profile.birthDate ? calculateAgeFromBirthDate(profile.birthDate) : profile.age,
  });
};

const normalizeHistoryText = (value: string) => value.replace(/\s+/g, " ").trim();

const isAllowedRiwayatFilter = (value: string): value is (typeof RIWAYAT_FILTER_OPTIONS)[number] =>
  RIWAYAT_FILTER_OPTIONS.includes(value as (typeof RIWAYAT_FILTER_OPTIONS)[number]);

const MEASUREMENT_HISTORY_EVENT_TYPES = new Set(["Pengukuran", "Sinkronisasi Alat", "Tekanan Darah", "Detak Jantung", "Berat Badan", "Tinggi Badan"]);

type MealHistoryEntry = {
  mealType: string;
  foodKey: string;
  foodName: string;
  time: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  saturatedFat: number;
  unsaturatedFat: number;
};

type FoodOption = {
  key: string;
  name: string;
  group: "Karbohidrat" | "Protein" | "Lemak Jenuh" | "Lemak Tak Jenuh" | "Serat";
  recommendedFor?: Array<"Sarapan" | "Makan Siang" | "Makan Malam" | "Camilan" | "Tambahan">;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  saturatedFat: number;
  unsaturatedFat: number;
};

type VirtualEducationMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  createdAt: string;
};

const toVirtualEducationMessage = (message: EducationChatMessageDoc & { id: string }): VirtualEducationMessage => ({
  id: message.id,
  role: message.role,
  text: message.text,
  createdAt: message.createdAt,
});

const isLegacyGreetingMessage = (message: VirtualEducationMessage) =>
  message.role === "assistant" && message.text.toLowerCase().includes("saya asisten edukasi kesehatan anda");

const filterEducationMessages = (messages: VirtualEducationMessage[]) => messages.filter((message) => !isLegacyGreetingMessage(message));

const FOOD_OPTIONS: FoodOption[] = [
  { key: "nasi_putih", name: "Nasi Putih 100 gr", group: "Karbohidrat", recommendedFor: ["Sarapan", "Makan Siang", "Makan Malam"], calories: 130, carbs: 28, protein: 2.7, fat: 0.3, fiber: 0.4, saturatedFat: 0.1, unsaturatedFat: 0.1 },
  { key: "roti_gandum", name: "Roti Gandum", group: "Karbohidrat", calories: 130, carbs: 24, protein: 6, fat: 2, fiber: 4, saturatedFat: 0, unsaturatedFat: 1 },
  { key: "kentang_rebus", name: "Kentang Rebus", group: "Karbohidrat", calories: 110, carbs: 26, protein: 3, fat: 0, fiber: 2, saturatedFat: 0, unsaturatedFat: 0 },
  { key: "daging_sapi", name: "Daging Sapi", group: "Protein", calories: 250, carbs: 0, protein: 26, fat: 15, fiber: 0, saturatedFat: 6, unsaturatedFat: 7 },
  { key: "ayam_panggang", name: "Dada Ayam 100 gr", group: "Protein", calories: 165, carbs: 0, protein: 31, fat: 3.6, fiber: 0, saturatedFat: 1, unsaturatedFat: 2.2 },
  { key: "ikan_salmon", name: "Ikan Salmon", group: "Protein", calories: 208, carbs: 0, protein: 22, fat: 13, fiber: 0, saturatedFat: 3, unsaturatedFat: 8 },
  { key: "tempe", name: "Tempe", group: "Protein", calories: 190, carbs: 9, protein: 20, fat: 11, fiber: 2, saturatedFat: 2, unsaturatedFat: 5 },
  { key: "gorengan", name: "Gorengan", group: "Lemak Jenuh", calories: 230, carbs: 18, protein: 3, fat: 16, fiber: 1, saturatedFat: 7, unsaturatedFat: 5 },
  { key: "sosis", name: "Sosis", group: "Lemak Jenuh", calories: 210, carbs: 4, protein: 9, fat: 17, fiber: 0, saturatedFat: 6, unsaturatedFat: 5 },
  { key: "alpukat", name: "Alpukat", group: "Lemak Tak Jenuh", calories: 160, carbs: 9, protein: 2, fat: 15, fiber: 7, saturatedFat: 2, unsaturatedFat: 10 },
  { key: "almond", name: "Almond", group: "Lemak Tak Jenuh", calories: 170, carbs: 6, protein: 6, fat: 15, fiber: 4, saturatedFat: 1, unsaturatedFat: 11 },
  { key: "minyak_zaitun", name: "Minyak Zaitun", group: "Lemak Tak Jenuh", calories: 120, carbs: 0, protein: 0, fat: 14, fiber: 0, saturatedFat: 2, unsaturatedFat: 10 },
  { key: "pisang", name: "Pisang 100 gr", group: "Karbohidrat", recommendedFor: ["Camilan", "Tambahan", "Sarapan"], calories: 89, carbs: 23, protein: 1.1, fat: 0.3, fiber: 2.6, saturatedFat: 0.1, unsaturatedFat: 0.1 },
  { key: "bayam", name: "Bayam", group: "Serat", calories: 35, carbs: 5, protein: 3, fat: 0, fiber: 3, saturatedFat: 0, unsaturatedFat: 0 },
  { key: "brokoli", name: "Brokoli 100 gr", group: "Serat", calories: 34, carbs: 7, protein: 2.8, fat: 0.4, fiber: 2.6, saturatedFat: 0.1, unsaturatedFat: 0.1 },
  { key: "wortel", name: "Wortel", group: "Serat", calories: 40, carbs: 10, protein: 1, fat: 0, fiber: 3, saturatedFat: 0, unsaturatedFat: 0 },
  { key: "yogurt_plain", name: "Yogurt Plain", group: "Protein", recommendedFor: ["Camilan", "Tambahan"], calories: 95, carbs: 6, protein: 9, fat: 4, fiber: 0, saturatedFat: 2, unsaturatedFat: 1 },
  { key: "granola_bar", name: "Granola Bar", group: "Karbohidrat", recommendedFor: ["Camilan"], calories: 120, carbs: 19, protein: 3, fat: 4, fiber: 2, saturatedFat: 1, unsaturatedFat: 2 },
  { key: "biskuit_gandum", name: "Biskuit Gandum", group: "Karbohidrat", recommendedFor: ["Camilan"], calories: 110, carbs: 18, protein: 2, fat: 3, fiber: 2, saturatedFat: 1, unsaturatedFat: 1 },
  { key: "buah_potong", name: "Buah Potong Campur", group: "Serat", recommendedFor: ["Camilan"], calories: 80, carbs: 18, protein: 1, fat: 0, fiber: 3, saturatedFat: 0, unsaturatedFat: 0 },
  { key: "susu_protein", name: "Susu Tinggi Protein", group: "Protein", recommendedFor: ["Tambahan"], calories: 150, carbs: 12, protein: 15, fat: 4, fiber: 0, saturatedFat: 2, unsaturatedFat: 1 },
  { key: "telur_rebus", name: "Telur Rebus", group: "Protein", recommendedFor: ["Tambahan"], calories: 78, carbs: 1, protein: 6, fat: 5, fiber: 0, saturatedFat: 1.6, unsaturatedFat: 2 },
  { key: "oatmeal_susu", name: "Oatmeal Susu", group: "Karbohidrat", recommendedFor: ["Tambahan", "Sarapan"], calories: 160, carbs: 27, protein: 6, fat: 4, fiber: 4, saturatedFat: 1, unsaturatedFat: 2 },
  { key: "kacang_campur", name: "Kacang Campur", group: "Lemak Tak Jenuh", recommendedFor: ["Camilan", "Tambahan"], calories: 170, carbs: 8, protein: 6, fat: 14, fiber: 3, saturatedFat: 1.5, unsaturatedFat: 10 },
];

const FOOD_GROUP_ORDER: FoodOption["group"][] = [
  "Karbohidrat",
  "Protein",
  "Lemak Jenuh",
  "Lemak Tak Jenuh",
  "Serat",
];

const FOOD_GROUP_DESCRIPTIONS: Record<FoodOption["group"], string> = {
  Karbohidrat: "Sumber tenaga utama seperti nasi, roti, kentang, dan pisang.",
  Protein: "Membantu perbaikan jaringan tubuh, misalnya ayam, ikan, dan tempe.",
  "Lemak Jenuh": "Perlu dibatasi, contohnya gorengan dan makanan olahan berlemak.",
  "Lemak Tak Jenuh": "Lemak yang lebih baik untuk tubuh seperti alpukat, almond, dan minyak zaitun.",
  Serat: "Baik untuk pencernaan dan rasa kenyang, misalnya brokoli, bayam, dan wortel.",
};

const MEAL_TYPE_DESCRIPTIONS: Record<"Sarapan" | "Makan Siang" | "Makan Malam" | "Camilan" | "Tambahan", string> = {
  Sarapan: "Pilih makanan pembuka hari yang memberi energi dan cukup protein.",
  "Makan Siang": "Pilih menu utama yang seimbang agar energi siang hari tetap stabil.",
  "Makan Malam": "Pilih makanan yang mengenyangkan namun tetap terkontrol.",
  Camilan: "Gunakan pilihan ringan yang praktis, sehat, dan tidak berlebihan.",
  Tambahan: "Gunakan untuk asupan pelengkap seperti susu, telur, atau tambahan energi/protein.",
};

const getBloodPressureParts = (value?: string) => {
  const [systolicRaw, diastolicRaw] = String(value || "0/0").split("/");
  return {
    systolic: Number(systolicRaw) > 0 ? String(Number(systolicRaw)) : "",
    diastolic: Number(diastolicRaw) > 0 ? String(Number(diastolicRaw)) : "",
  };
};

const normalizeHealthNumberInput = (value: string, maxLength = 3) => value.replace(/\D/g, "").slice(0, maxLength);
const generateDeviceWriteKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `KEY-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  return `KEY-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
};

export default function Dashboard({ latest, userDisplayName, userUid, userEmail, onSignOut }: DashboardProps) {
  const [activeMenu, setActiveMenu] = useState<CoreMenuItem>("Dashboard");
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const [toast, setToast] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSavedAt, setManualSavedAt] = useState("");
  const [mealNote, setMealNote] = useState("");
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [mealHistoryEntries, setMealHistoryEntries] = useState<MealHistoryEntry[]>([]);
  const [mealPanel, setMealPanel] = useState("");
  const [mealSavedAt, setMealSavedAt] = useState("");
  const [mealDraft, setMealDraft] = useState({
    mealType: "Sarapan",
    foodKey: "nasi_putih",
    time: "07:30",
  });
  const [historyFilter, setHistoryFilter] = useState("Semua");
  const [reminderTab, setReminderTab] = useState("Semua");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllReminderLogs, setShowAllReminderLogs] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [educationChatMessages, setEducationChatMessages] = useState<VirtualEducationMessage[]>([]);
  const [educationChatInput, setEducationChatInput] = useState("");
  const [educationSpeechInputSupported, setEducationSpeechInputSupported] = useState(false);
  const [educationSpeechOutputSupported, setEducationSpeechOutputSupported] = useState(false);
  const [educationListening, setEducationListening] = useState(false);
  const [educationSpeaking, setEducationSpeaking] = useState(false);
  const educationSpeechRecognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const educationSpeechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const educationChatEndRef = useRef<HTMLDivElement | null>(null);
  const [activityTrendMetric, setActivityTrendMetric] = useState<"Langkah" | "Jarak" | "Kalori">("Langkah");
  const [mealSummaryRange, setMealSummaryRange] = useState<"Hari Ini" | "7 Hari">("Hari Ini");
  const [isActivityRunning, setIsActivityRunning] = useState(false);
  const [lastSessionInfo, setLastSessionInfo] = useState<{
    speedAvgMps: number;
    source: "gps" | "fallback";
    finishedAt: string;
    motionLabel: string;
  } | null>(null);
  const [activityType, setActivityType] = useState<"Jalan" | "Lari" | "Sepeda">("Jalan");
  const [activityHistory, setActivityHistory] = useState<string[][]>([]);
  const [activitySession, setActivitySession] = useState({
    steps: 0,
    distanceKm: 0,
    calories: 0,
    durationSec: 0,
    startedAt: "",
    startedAtIso: "",
    type: "Jalan" as "Jalan" | "Lari" | "Sepeda",
  });
  const [connectDeviceModalOpen, setConnectDeviceModalOpen] = useState(false);
  const [deviceConnectError, setDeviceConnectError] = useState("");
  const [deviceConnectSaving, setDeviceConnectSaving] = useState(false);
  const [deviceIdInput, setDeviceIdInput] = useState(DEFAULT_DEVICE_ID);
  const [deviceWriteKey, setDeviceWriteKey] = useState(DEFAULT_DEVICE_WRITE_KEY);
  const processingDeviceEntriesRef = useRef(new Set<string>());
  const bmiBackfillRef = useRef(new Set<string>());
  const [deviceLatest, setDeviceLatest] = useState<HealthData | null>(null);
  const healthPredictionSignatureRef = useRef("");
  const initialBloodPressureParts = getBloodPressureParts(latest?.bloodPressure);
  const [manualSystolic, setManualSystolic] = useState(initialBloodPressureParts.systolic);
  const [manualDiastolic, setManualDiastolic] = useState(initialBloodPressureParts.diastolic);
  const [manualHeartRate, setManualHeartRate] = useState(latest?.heartRate && latest.heartRate > 0 ? String(latest.heartRate) : "");
  const [deviceEducation, setDeviceEducation] = useState({
    score: 0,
    status: "-",
    summary: "-",
    recommendations: [] as string[],
  });
  const [healthPrediction, setHealthPrediction] = useState<ReturnType<typeof predictHealthStatus> | null>(null);
  const [deviceIdentity, setDeviceIdentity] = useState({
    connected: false,
    deviceId: DEFAULT_DEVICE_ID,
    userId: "-",
    userName: "-",
  });
  const [addedRecommendations, setAddedRecommendations] = useState<string[]>([]);
  const [reminderDocs, setReminderDocs] = useState<Array<ReminderDoc & { id: string }>>([]);
  const [reminderModal, setReminderModal] = useState("");
  const [editingReminderId, setEditingReminderId] = useState("");
  const [reminderDraft, setReminderDraft] = useState({
    title: "",
    description: "",
    time: "08:00",
    frequency: "Setiap hari",
    category: "Kesehatan" as ReminderDoc["category"],
  });
  const [syncTime, setSyncTime] = useState(() => formatLocalDateTime(new Date()));
  const [deviceLastSeenAt, setDeviceLastSeenAt] = useState("");
  const [language, setLanguage] = useState("Bahasa Indonesia");
  const [theme, setTheme] = useState<"Terang" | "Gelap" | "Sistem">(() => {
    if (typeof window === "undefined") return "Terang";
    try {
      const savedTheme = window.localStorage.getItem("sehatai-theme");
      if (savedTheme === "Terang" || savedTheme === "Gelap" || savedTheme === "Sistem") return savedTheme;
    } catch {
      // Abaikan kalau storage diblokir browser.
    }
    return "Terang";
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  const [deviceNow, setDeviceNow] = useState(() => new Date());
  const [deviceStatusTick, setDeviceStatusTick] = useState(0);
  const [measurementHistoryDb, setMeasurementHistoryDb] = useState<MeasurementHistoryDoc[]>([]);
  const [activitySessionDocs, setActivitySessionDocs] = useState<Array<{
    id: string;
    started_at: string;
    finished_at: string;
    duration_sec: number;
    distance_m: number;
    speed_avg_mps: number;
    motion_label: string;
    langkah: number;
    kalori: number;
    source: "gps" | "fallback";
  }>>([]);
  const [historyEventDocs, setHistoryEventDocs] = useState<Array<HistoryEventDoc & { id: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResetting, setHistoryResetting] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>({
    "Pengingat Minum Air": true,
    "Pengingat Aktivitas": true,
    "Pengingat Pola Makan": true,
    "Ringkasan Harian": false,
  });
  const [alarmVibration, setAlarmVibration] = useState(true);
  const [alarmSound, setAlarmSound] = useState("Nada Default");
  const [alarmSnooze, setAlarmSnooze] = useState("5 Menit");
  const [alarmVolume, setAlarmVolume] = useState(62);
  const [alarmPanel, setAlarmPanel] = useState("");
  const alarmPreviewAt = useRef(0);
  const activityCalibrationStorageKey = getActivityCalibrationStorageKey(userUid || "", userEmail || "");
  const [activityCalibration, setActivityCalibration] = useState<ActivityCalibrationStore>(() =>
    readStore(activityCalibrationStorageKey, DEFAULT_ACTIVITY_CALIBRATION)
  );
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsLastPointRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const gpsLastTimestampRef = useRef<number | null>(null);
  const gpsAcceptedSamplesRef = useRef(0);
  const gpsAccuracyWindowRef = useRef<number[]>([]);
  const motionStepListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const motionStepCountRef = useRef(0);
  const motionLastPeakAtRef = useRef(0);
  const motionBaselineRef = useRef(9.81);
  const motionMagnitudeWindowRef = useRef<number[]>([]);
  const [motionPermissionState, setMotionPermissionState] = useState<"idle" | "requesting" | "granted" | "denied" | "unavailable">("idle");
  const [motionStepCount, setMotionStepCount] = useState(0);
  const activityModeRef = useRef<"Jalan" | "Lari" | "Sepeda">("Jalan");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "warming" | "tracking" | "fallback" | "unsupported" | "denied">("idle");
  const [gpsErrorMessage, setGpsErrorMessage] = useState("");
  const [gpsLastPointLabel, setGpsLastPointLabel] = useState("-");
  const [gpsSpeedMps, setGpsSpeedMps] = useState(0);
  const [gpsDetectedMotion, setGpsDetectedMotion] = useState("Belum terdeteksi");
  const [activeSettingsPanel, setActiveSettingsPanel] = useState("");
  const [activeHelpArticle, setActiveHelpArticle] = useState("");
  const [targetPrefs, setTargetPrefs] = useState({
    steps: "10000",
    calories: "2000",
    duration: "60",
    water: "8",
  });
  const [unitPrefs, setUnitPrefs] = useState({
    weight: "Kilogram (kg)",
    height: "Sentimeter (cm)",
    distance: "Kilometer (km)",
    calories: "Kilokalori (kkal)",
  });
  const [privacyPrefs, setPrivacyPrefs] = useState({
    twoFactor: false,
    dataSharing: true,
    accessPermission: true,
  });
  const [reminderEnabled, setReminderEnabled] = useState<Record<string, boolean>>({
    "Minum Air Putih": true,
    "Olahraga Ringan": true,
    "Cek Kesehatan": true,
    "Minum Obat": true,
    "Tidur Lebih Awal": true,
  });
  const initialName = userDisplayName?.trim() || "Andi Setiawan";
  const profileStorageKey = getProfileStorageKey(userUid || "", userEmail || "");
  const defaultProfile = buildDefaultEditableProfile({ initialName, userEmail: userEmail || "", latest: latest ?? null });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profile, setProfile] = useState<EditableProfile>(() => readLocalEditableProfile(profileStorageKey, defaultProfile));
  const [draftProfile, setDraftProfile] = useState(profile);
  const name = profile.fullName.trim() || initialName;
  const profileMetaLine = [profile.gender, profile.age ? `${profile.age} tahun` : ""].filter(Boolean).join(" - ") || "-";
  const menuItems = MENU_NAV_ITEMS;
  const mobileBottomNav = MENU_NAV_ITEMS;
  const supportContact = {
    email: "ireniusrikardo71@gmail.com",
    phone: "081335664527",
    whatsapp: "6281335664527",
  };

  const effectiveLatest = deviceLatest ?? latest ?? null;
  const height = effectiveLatest?.height ?? 0;
  const weight = effectiveLatest?.weight ?? 0;
  const latestMeasurement = measurementHistoryDb[0] ?? null;
  const profileHeight = Number(profile.height) || 0;
  const profileWeight = Number(profile.weight) || 0;
  const dashboardHeight = Number(latestMeasurement?.tinggi_badan) || Number(deviceLatest?.height) || profileHeight || 0;
  const dashboardWeight = Number(latestMeasurement?.berat_badan) || Number(deviceLatest?.weight) || profileWeight || 0;
  const dashboardBmiFromMeasurement = Number(latestMeasurement?.bmi) || 0;
  const dashboardBmiFromDevice = Number(deviceLatest?.bmi) || 0;
  const dashboardBmi =
    dashboardBmiFromMeasurement > 0
      ? dashboardBmiFromMeasurement
      : dashboardBmiFromDevice > 0
        ? dashboardBmiFromDevice
        : Number(latestMeasurement?.tinggi_badan) > 0 && Number(latestMeasurement?.berat_badan) > 0
          ? Number((Number(latestMeasurement.berat_badan) / Math.pow(Number(latestMeasurement.tinggi_badan) / 100, 2)).toFixed(1))
          : 0;
  const dashboardBmiRecordedAt = latestMeasurement?.tanggal_pengukuran
    ? formatLocalDateTime(latestMeasurement.tanggal_pengukuran)
    : "";
  const displayedSystolic = manualSystolic.trim();
  const displayedDiastolic = manualDiastolic.trim();
  const heartRate = Number(manualHeartRate.trim()) || 0;
  const steps = effectiveLatest?.steps ?? 0;
  const bloodPressure = displayedSystolic && displayedDiastolic ? `${displayedSystolic}/${displayedDiastolic}` : "0/0";
  const sleepHours = 0;

  const hasHeight = height > 0;
  const hasWeight = weight > 0;
  const hasHeartRate = heartRate > 0;
  const hasSteps = steps > 0;
  const hasBloodPressure = bloodPressure !== "0/0";
  const hasSleep = sleepHours > 0;
  const hasMealData = mealHistoryEntries.length > 0 || waterGlasses > 0 || mealNote.trim().length > 0;
  const hasLiveActivity = activitySession.steps > 0 || activitySession.durationSec > 0;

  const formatDuration = (seconds: number) => {
    const hour = Math.floor(seconds / 3600);
    const minute = Math.floor((seconds % 3600) / 60);
    const second = seconds % 60;
    if (hour > 0) return `${hour}j ${String(minute).padStart(2, "0")}m`;
    return `${minute}m ${String(second).padStart(2, "0")}d`;
  };

  const toRadians = (degree: number) => (degree * Math.PI) / 180;

  // Rumus Haversine: d = 2r * asin( sqrt( sin^2((φ2-φ1)/2) + cos(φ1)cos(φ2)sin^2((λ2-λ1)/2) ) )
  const calculateDistanceMeters = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) => {
    const earthRadiusMeters = 6371000;
    const phi1 = toRadians(from.latitude);
    const phi2 = toRadians(to.latitude);
    const deltaPhi = toRadians(to.latitude - from.latitude);
    const deltaLambda = toRadians(to.longitude - from.longitude);
    const a =
      Math.sin(deltaPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
    return earthRadiusMeters * c;
  };

  const smoothCoordinatePoint = (
    previous: { latitude: number; longitude: number } | null,
    next: { latitude: number; longitude: number },
    weight: number
  ) => {
    if (!previous) return next;
    const clampedWeight = Math.max(0.15, Math.min(0.85, weight));
    return {
      latitude: previous.latitude + (next.latitude - previous.latitude) * clampedWeight,
      longitude: previous.longitude + (next.longitude - previous.longitude) * clampedWeight,
    };
  };

  const classifyMotionBySpeed = (speedMps: number) => {
    if (speedMps < 0.5) return "diam";
    if (speedMps < 1.8) return "jalan kaki";
    if (speedMps < 3.5) return "lari";
    return "kendaraan / bersepeda cepat";
  };

  const resolveMetValue = (motion: string) => {
    if (motion === "jalan kaki") return 2.5;
    if (motion === "lari") return 7;
    if (motion === "kendaraan / bersepeda cepat") return 6;
    return 1.2;
  };

  const resolveModeSpeedBounds = (type: "Jalan" | "Lari" | "Sepeda") => {
    if (type === "Lari") return { min: 1.8, max: 6.2 };
    if (type === "Sepeda") return { min: 2.5, max: 14 };
    return { min: 0.45, max: 2.25 };
  };

  const resolveMetValueByType = (type: "Jalan" | "Lari" | "Sepeda", speedMps: number) => {
    if (type === "Lari") {
      if (speedMps < 2.4) return 6.5;
      if (speedMps < 3.2) return 8.3;
      return 10;
    }
    if (type === "Sepeda") {
      if (speedMps < 4.2) return 4.8;
      if (speedMps < 6.5) return 6.8;
      return 8.5;
    }
    if (speedMps < 1.0) return 2.3;
    if (speedMps < 1.45) return 3.0;
    return 3.8;
  };

  const resolveBaseStrideLengthMeters = (bodyHeightCm: number, type: "Jalan" | "Lari" | "Sepeda") => {
    const heightMeters = Math.max(1.2, bodyHeightCm / 100);
    if (type === "Lari") return Number((heightMeters * 0.65).toFixed(2));
    if (type === "Sepeda") return 0;
    return Number((heightMeters * 0.415).toFixed(2));
  };

  const resolveStrideLengthMeters = (bodyHeightCm: number, type: "Jalan" | "Lari" | "Sepeda") => {
    const baseStride = resolveBaseStrideLengthMeters(bodyHeightCm, type);
    const multiplier = Math.max(0.75, Math.min(1.35, activityCalibration.strideMultiplier[type] || 1));
    return Number((baseStride * multiplier).toFixed(2));
  };

  const estimateStepsFromDistance = (distanceMeters: number, bodyHeightCm: number, type: "Jalan" | "Lari" | "Sepeda", motion: string) => {
    if (type === "Sepeda" || motion === "kendaraan / bersepeda cepat") return 0;
    const strideLengthMeters = resolveStrideLengthMeters(bodyHeightCm, type);
    if (!Number.isFinite(strideLengthMeters) || strideLengthMeters <= 0) return 0;
    return Math.max(0, Math.round(distanceMeters / strideLengthMeters));
  };

  const activityPresets: Record<"Jalan" | "Lari" | "Sepeda", { icon: string; cadenceMin: number; cadenceMax: number; speedMin: number; speedMax: number }> = {
    Jalan: { icon: "fa-person-walking", cadenceMin: 88, cadenceMax: 118, speedMin: 1.05, speedMax: 1.65 },
    Lari: { icon: "fa-person-running", cadenceMin: 150, cadenceMax: 176, speedMin: 2.1, speedMax: 3.4 },
    Sepeda: { icon: "fa-bicycle", cadenceMin: 0, cadenceMax: 0, speedMin: 4.5, speedMax: 7.8 },
  };
  const currentActivityType = isActivityRunning ? activitySession.type : activityType;
  const currentMotionLabel =
    isActivityRunning && gpsDetectedMotion !== "Belum terdeteksi" ? gpsDetectedMotion : currentActivityType;
  const lastSessionSourceLabel = lastSessionInfo?.source === "gps" ? "GPS" : lastSessionInfo?.source === "fallback" ? "Fallback" : "-";

  const totalActivitySteps = steps + activitySession.steps;
  const liveDistanceText = activitySession.distanceKm > 0 ? activitySession.distanceKm.toFixed(2) : hasSteps ? "5.2" : "-";
  const liveCaloriesText = activitySession.calories > 0 ? Math.round(activitySession.calories).toLocaleString("id-ID") : hasSteps ? "312" : "-";
  const liveDurationText = activitySession.durationSec > 0 ? formatDuration(activitySession.durationSec) : hasSteps ? "1j 08m" : "-";

  const hasAnyData = hasHeight || hasWeight || hasHeartRate || hasSteps || hasBloodPressure || hasSleep || hasMealData || hasLiveActivity;
  const deviceLastSeenTime = deviceLastSeenAt ? new Date(deviceLastSeenAt).getTime() : 0;
  const deviceStatusNow = Date.now() + deviceStatusTick * 0;
  const isDeviceLinked = deviceIdentity.connected;
  const isDeviceOnline = deviceLastSeenTime > 0 && deviceStatusNow - deviceLastSeenTime < 3 * 60 * 1000;
  const isDeviceConnected = isDeviceLinked;
  const resolvedTheme = theme === "Sistem" ? (systemPrefersDark ? "dark" : "light") : theme === "Gelap" ? "dark" : "light";
  const gpsStatusLabel =
    gpsStatus === "tracking"
      ? "GPS Aktif"
      : gpsStatus === "warming"
        ? "Menunggu Stabil"
      : gpsStatus === "fallback"
        ? "Estimasi Langkah"
        : gpsStatus === "unsupported"
          ? "GPS Tidak Didukung"
          : gpsStatus === "denied"
            ? "Izin Lokasi Ditolak"
            : "GPS Siap";
  const deviceStatus = isDeviceOnline ? "Online" : isDeviceLinked ? "Tertaut, alat offline" : "Tidak Terhubung";
  const deviceStatusTone = isDeviceOnline ? "bg-emerald-100 text-emerald-700" : isDeviceLinked ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
  const deviceSyncLabel = deviceLastSeenAt ? `Data terakhir: ${syncTime}` : isDeviceLinked ? "Menunggu data dari alat" : "Belum tersinkronisasi";

  const bpStatus = useMemo(() => {
    if (!hasBloodPressure) return "-";
    const [s, d] = bloodPressure.split("/").map(Number);
    if (!Number.isFinite(s) || !Number.isFinite(d)) return "-";
    if (s < 90 || d < 60) return "Rendah";
    if (s <= 129 && d <= 84) return "Normal";
    if (s <= 139 || d <= 89) return "Waspada";
    return "Tinggi";
  }, [bloodPressure, hasBloodPressure]);

  const hrStatus = !hasHeartRate ? "-" : heartRate < 60 ? "Rendah" : heartRate <= 100 ? "Normal" : "Tinggi";

  const weekly = totalActivitySteps > 0 ? [5105, 6832, 8210, 7105, 6300, 4892, totalActivitySteps] : [0, 0, 0, 0, 0, 0, 0];
  const weeklyDistanceKm = weekly.map((value) => Number((value * 0.00072).toFixed(2)));
  const weeklyCalories = weekly.map((value) => Math.round(value * 0.042));
  const trendSeries = !isMobileViewport
    ? weekly
    : activityTrendMetric === "Jarak"
      ? weeklyDistanceKm
      : activityTrendMetric === "Kalori"
        ? weeklyCalories
        : weekly;
  const trendMax = Math.max(...trendSeries, 1);
  const weekLabels = Array.from({ length: 7 }, (_, index) => {
    const sample = new Date(deviceNow);
    sample.setDate(sample.getDate() - (6 - index));
    return formatLocalDayMonth(sample);
  });
  const weekMax = Math.max(...weekly, 1);
  const formatActivityFinishedAt = (isoString: string) => {
    return formatLocalDateTime(isoString, isoString || "-");
  };
  const formatSampleDateTime = (daysAgo: number, hour: number, minute: number) => {
    const sample = new Date(deviceNow);
    sample.setDate(sample.getDate() - daysAgo);
    sample.setHours(hour, minute, 0, 0);
    return formatLocalDateTime(sample);
  };
  const getActivityIntensityLevel = (session: { motion_label: string; speed_avg_mps: number; source: "gps" | "fallback" }) => {
    const label = String(session.motion_label || "").toLowerCase();
    const speed = Number(session.speed_avg_mps) || 0;
    if (label.includes("lari") || speed >= 2.4) return "berat" as const;
    if (label.includes("sepeda") || speed >= 1.35 || session.source === "gps") return "sedang" as const;
    return "ringan" as const;
  };

  const activityRows = [
    ["🚶", "Jalan Pagi", formatSampleDateTime(0, 7, 30), hasAnyData ? "5.2 km" : "-", hasAnyData ? "45 menit" : "-", hasAnyData ? "312 kcal" : "-"],
    ["🚴", "Bersepeda", formatSampleDateTime(1, 16, 15), hasAnyData ? "12.4 km" : "-", hasAnyData ? "1j 08m" : "-", hasAnyData ? "560 kcal" : "-"],
    ["🏃", "Jalan Santai", formatSampleDateTime(2, 8, 45), hasAnyData ? "3.1 km" : "-", hasAnyData ? "30 menit" : "-", hasAnyData ? "150 kcal" : "-"],
  ];

  const reminderRows = [
    ["💧", "Minum Air", "Setiap 2 jam", hasAnyData ? "10:00" : "-"],
    ["🏃", "Olahraga Ringan", "Setiap hari", hasAnyData ? "17:00" : "-"],
    ["🌙", "Tidur Lebih Awal", "Setiap hari", hasAnyData ? "22:00" : "-"],
  ];
  const runningActivityRow = isActivityRunning
    ? [["[LIVE]", `${currentMotionLabel} (Sedang Berjalan)`, activitySession.startedAt || "-", `${activitySession.distanceKm.toFixed(2)} km`, formatDuration(activitySession.durationSec), `${Math.round(activitySession.calories)} kcal`]]
    : [];
  const activityRowsLive = [...runningActivityRow, ...(activityHistory.length > 0 ? activityHistory : activityRows)];
  const activityDataSessions = activitySessionDocs.filter(
    (session) =>
      Number(session.langkah) > 0 ||
      Number(session.distance_m) > 0 ||
      Number(session.kalori) > 0 ||
      Number(session.duration_sec) > 0
  );
  const hasTrackedActivity = totalActivitySteps > 0 || activityDataSessions.length > 0 || isActivityRunning;
  const latestRecordedActivity = activityDataSessions[0] || null;
  const activityIntensitySummary = activityDataSessions.reduce(
    (summary, session) => {
      const bucket = getActivityIntensityLevel(session);
      summary[bucket].durationSec += Number(session.duration_sec) || 0;
      summary[bucket].calories += Number(session.kalori) || 0;
      return summary;
    },
    {
      ringan: { durationSec: 0, calories: 0 },
      sedang: { durationSec: 0, calories: 0 },
      berat: { durationSec: 0, calories: 0 },
    }
  );
  const weeklyActivityTotal = weekly.reduce((sum, value) => sum + value, 0);
  const weeklyDistanceTotal = weeklyDistanceKm.reduce((sum, value) => sum + value, 0);
  const weeklyCaloriesTotal = weeklyCalories.reduce((sum, value) => sum + value, 0);
  const weeklyActiveDays = weekly.filter((value) => value > 0).length;
  let weeklyActivityStreak = 0;
  for (let index = weekly.length - 1; index >= 0; index -= 1) {
    if (weekly[index] > 0) {
      weeklyActivityStreak += 1;
      continue;
    }
    break;
  }
  const averageActivitySpeed =
    activityDataSessions.length > 0
      ? activityDataSessions.reduce((sum, session) => sum + (Number(session.speed_avg_mps) || 0), 0) / activityDataSessions.length
      : lastSessionInfo?.speedAvgMps || 0;
  const activityGoalRemaining = Math.max(0, 10000 - totalActivitySteps);
  const activityRecommendations = [
    !hasTrackedActivity ? "Mulai sesi singkat 10 sampai 15 menit agar pola gerak Anda mulai terbaca." : "",
    totalActivitySteps > 0 && totalActivitySteps < 10000
      ? `Tambah sekitar ${activityGoalRemaining.toLocaleString("id-ID")} langkah lagi untuk mendekati target harian.`
      : "",
    totalActivitySteps >= 10000 ? "Target langkah hari ini sudah tercapai. Jaga pendinginan dan hidrasi setelah bergerak." : "",
    gpsStatus === "denied" ? "Aktifkan izin lokasi agar jarak, kecepatan, dan mode aktivitas lebih akurat." : "",
    latestRecordedActivity && Number(latestRecordedActivity.duration_sec) < 900
      ? "Durasi sesi terakhir masih singkat. Coba tambah 5 sampai 10 menit pada sesi berikutnya."
      : "",
    latestRecordedActivity?.source === "fallback" ? "Data sesi terakhir masih estimasi. Gunakan GPS saat sinyal lokasi stabil." : "",
  ].filter(Boolean);
  const activityOverviewCards = [
    {
      label: "Mode Aktif",
      value: currentActivityType,
      note: isActivityRunning ? "Sedang direkam live" : "Siap untuk sesi berikutnya",
    },
    {
      label: "Status GPS",
      value: gpsStatusLabel,
      note: gpsErrorMessage || (isActivityRunning ? gpsLastPointLabel : "Pemantauan lokasi untuk sesi berjalan"),
    },
    {
      label: "Sesi Tersimpan",
      value: hasTrackedActivity ? String(activityDataSessions.length) : "-",
      note: hasTrackedActivity ? "Tersimpan di akun ini" : "Belum ada sesi tersimpan",
    },
    {
      label: "Rata-rata Kecepatan",
      value: averageActivitySpeed > 0 ? `${averageActivitySpeed.toFixed(2)} m/s` : "-",
      note: latestRecordedActivity ? `Sumber dominan ${lastSessionSourceLabel}` : "Muncul setelah ada sesi terekam",
    },
  ] as const;
  const selectedFood = FOOD_OPTIONS.find((item) => item.key === mealDraft.foodKey) || FOOD_OPTIONS[0];
  const recommendedFoodOptions = FOOD_OPTIONS.filter((item) => item.recommendedFor?.includes(mealDraft.mealType as "Sarapan" | "Makan Siang" | "Makan Malam" | "Camilan" | "Tambahan"));
  const totalMealCalories = mealHistoryEntries.reduce((total, item) => total + item.calories, 0);
  const totalMealCarbs = mealHistoryEntries.reduce((total, item) => total + item.carbs, 0);
  const totalMealProtein = mealHistoryEntries.reduce((total, item) => total + item.protein, 0);
  const totalMealFat = mealHistoryEntries.reduce((total, item) => total + item.fat, 0);
  const totalMealFiber = mealHistoryEntries.reduce((total, item) => total + item.fiber, 0);
  const totalSaturatedFat = mealHistoryEntries.reduce((total, item) => total + item.saturatedFat, 0);
  const totalUnsaturatedFat = mealHistoryEntries.reduce((total, item) => total + item.unsaturatedFat, 0);
  const totalMealSelections = mealHistoryEntries.length;
  const calorieTotalBase = totalMealCalories;
  const carbsBase = totalMealCarbs;
  const proteinBase = totalMealProtein;
  const fatBase = totalMealFat;
  const waterTotalBase = waterGlasses;
  const fiberBase = totalMealFiber;
  const mealCaloriesDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? calorieTotalBase * 7 : calorieTotalBase;
  const calorieTarget = Math.max(1, Number(targetPrefs.calories) || 2000);
  const carbTarget = 420;
  const proteinTarget = 125;
  const fatTarget = 100;
  const waterTarget = Math.max(1, Number(targetPrefs.water) || 8);
  const fiberTarget = 25;
  const mealTargetForRange = isMobileViewport && mealSummaryRange === "7 Hari" ? calorieTarget * 7 : calorieTarget;
  const carbTargetForRange = isMobileViewport && mealSummaryRange === "7 Hari" ? carbTarget * 7 : carbTarget;
  const proteinTargetForRange = isMobileViewport && mealSummaryRange === "7 Hari" ? proteinTarget * 7 : proteinTarget;
  const fatTargetForRange = isMobileViewport && mealSummaryRange === "7 Hari" ? fatTarget * 7 : fatTarget;
  const waterTargetForRange = isMobileViewport && mealSummaryRange === "7 Hari" ? waterTarget * 7 : waterTarget;
  const fiberTargetForRange = isMobileViewport && mealSummaryRange === "7 Hari" ? fiberTarget * 7 : fiberTarget;
  const mealPercentFromTarget = Math.min(100, Math.round((mealCaloriesDisplay / mealTargetForRange) * 100));
  const carbsDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? carbsBase * 7 : carbsBase;
  const proteinDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? proteinBase * 7 : proteinBase;
  const fatDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? fatBase * 7 : fatBase;
  const waterDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? waterTotalBase * 7 : waterTotalBase;
  const fiberDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? fiberBase * 7 : fiberBase;
  const saturatedFatDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? totalSaturatedFat * 7 : totalSaturatedFat;
  const unsaturatedFatDisplay = isMobileViewport && mealSummaryRange === "7 Hari" ? totalUnsaturatedFat * 7 : totalUnsaturatedFat;
  const carbsPercent = Math.min(100, Math.round((carbsDisplay / carbTargetForRange) * 100));
  const proteinPercent = Math.min(100, Math.round((proteinDisplay / proteinTargetForRange) * 100));
  const fatPercent = Math.min(100, Math.round((fatDisplay / fatTargetForRange) * 100));
  const waterPercent = Math.min(100, Math.round((waterDisplay / waterTargetForRange) * 100));
  const fiberPercent = Math.min(100, Math.round((fiberDisplay / fiberTargetForRange) * 100));
  const macroOtherDisplay = Math.max(0, fiberDisplay);
  const activityPercent = totalActivitySteps > 0 ? Math.min(100, Math.round((totalActivitySteps / 10000) * 100)) : 0;
  const activityDistance = liveDistanceText;
  const activityCalories = liveCaloriesText;
  const activityDuration = liveDurationText;
  const mealPercent = hasMealData ? mealPercentFromTarget : 0;
  const nutritionCards = [
    ["fa-fire", "Kalori", mealCaloriesDisplay > 0 ? mealCaloriesDisplay.toLocaleString("id-ID") : "-", "kkal", mealCaloriesDisplay > 0 ? `${mealPercent}% dari target ${Number(mealTargetForRange).toLocaleString("id-ID")} kkal` : "-", "calories"],
    ["fa-wheat-awn", "Karbohidrat", carbsDisplay > 0 ? carbsDisplay.toLocaleString("id-ID") : "-", "g", carbsDisplay > 0 ? `${carbsPercent}% dari target ${Number(carbTargetForRange).toLocaleString("id-ID")} g` : "-", "carbs"],
    ["fa-drumstick-bite", "Protein", proteinDisplay > 0 ? proteinDisplay.toLocaleString("id-ID") : "-", "g", proteinDisplay > 0 ? `${proteinPercent}% dari target ${Number(proteinTargetForRange).toLocaleString("id-ID")} g` : "-", "protein"],
    ["fa-droplet", "Lemak", fatDisplay > 0 ? fatDisplay.toLocaleString("id-ID") : "-", "g", fatDisplay > 0 ? `${fatPercent}% target | Jenuh ${saturatedFatDisplay.toLocaleString("id-ID")} g | Tak jenuh ${unsaturatedFatDisplay.toLocaleString("id-ID")} g` : "-", "fat"],
    ["fa-glass-water", "Air", waterDisplay > 0 ? waterDisplay.toLocaleString("id-ID") : "-", "gelas", waterDisplay > 0 ? `${waterPercent}% dari target ${Number(waterTargetForRange).toLocaleString("id-ID")} gelas` : "-", "water"],
    ["fa-leaf", "Serat", fiberDisplay > 0 ? fiberDisplay.toLocaleString("id-ID") : "-", "g", fiberDisplay > 0 ? `${fiberPercent}% dari target ${Number(fiberTargetForRange).toLocaleString("id-ID")} g` : "-", "fiber"],
  ] as const;
  const mealHistoryToday = [
    ["Kalori", mealCaloriesDisplay > 0 ? `${mealCaloriesDisplay.toLocaleString("id-ID")} kkal` : "-", totalMealSelections > 0 ? `Total dari ${totalMealSelections} makanan hari ini` : "-"],
    ["Karbohidrat", carbsDisplay > 0 ? `${carbsDisplay.toLocaleString("id-ID")} g` : "-", totalMealSelections > 0 ? "Akumulasi karbohidrat hari ini" : "-"],
    ["Protein", proteinDisplay > 0 ? `${proteinDisplay.toLocaleString("id-ID")} g` : "-", totalMealSelections > 0 ? "Akumulasi protein hari ini" : "-"],
    ["Lemak", fatDisplay > 0 ? `${fatDisplay.toLocaleString("id-ID")} g` : "-", totalMealSelections > 0 ? `Jenuh ${saturatedFatDisplay.toLocaleString("id-ID")} g • Tak jenuh ${unsaturatedFatDisplay.toLocaleString("id-ID")} g` : "-"],
    ["Air", waterDisplay > 0 ? `${waterDisplay.toLocaleString("id-ID")} gelas` : "-", waterDisplay > 0 ? "Total hidrasi hari ini" : "-"],
    ["Serat", fiberDisplay > 0 ? `${fiberDisplay.toLocaleString("id-ID")} g` : "-", totalMealSelections > 0 ? "Akumulasi serat hari ini" : "-"],
  ];

  const bpSystolic = Number(bloodPressure.split("/")[0]);
  const makeChartBars = (value: number, hasData: boolean) =>
    hasData && Number.isFinite(value) && value > 0
      ? [0.82, 0.88, 0.8, 0.93, 0.86, 0.9, 1].map((ratio) => Math.max(10, Math.round(value * ratio)))
      : [0, 0, 0, 0, 0, 0, 0];
  const historyCharts = [
    {
      title: "Tinggi Badan (cm)",
      value: hasHeight ? String(height) : "-",
      gradient: "from-sky-500 to-sky-300",
      hasData: hasHeight,
      bars: makeChartBars(height, hasHeight),
    },
    {
      title: "Berat Badan (kg)",
      value: hasWeight ? String(weight) : "-",
      gradient: "from-teal-500 to-teal-300",
      hasData: hasWeight,
      bars: makeChartBars(weight, hasWeight),
    },
    {
      title: "Tekanan Darah (mmHg)",
      value: hasBloodPressure ? bloodPressure : "-",
      gradient: "from-emerald-500 to-emerald-300",
      hasData: hasBloodPressure,
      bars: makeChartBars(bpSystolic, hasBloodPressure),
    },
    {
      title: "Detak Jantung (bpm)",
      value: hasHeartRate ? String(heartRate) : "-",
      gradient: "from-rose-500 to-rose-300",
      hasData: hasHeartRate,
      bars: makeChartBars(heartRate, hasHeartRate),
    },
    {
      title: "Aktivitas (langkah)",
      value: totalActivitySteps > 0 ? totalActivitySteps.toLocaleString("id-ID") : "-",
      gradient: "from-green-500 to-green-300",
      hasData: totalActivitySteps > 0,
      bars: weekly,
    },
    {
      title: "Pola Makan (kcal)",
      value: hasMealData ? totalMealCalories.toLocaleString("id-ID") : "-",
      gradient: "from-amber-500 to-amber-300",
      hasData: hasMealData,
      bars: makeChartBars(totalMealCalories, hasMealData),
    },
  ];
  const reminderStyleByCategory: Record<ReminderDoc["category"], { icon: string; color: string }> = {
    Kesehatan: { icon: "fa-heart-pulse", color: "rose" },
    Obat: { icon: "fa-capsules", color: "violet" },
    Aktivitas: { icon: "fa-person-walking", color: "emerald" },
    Tidur: { icon: "fa-moon", color: "indigo" },
    Minum: { icon: "fa-droplet", color: "blue" },
    Lainnya: { icon: "fa-bell", color: "slate" },
  };
  const activeReminders: ReminderListItem[] = reminderDocs.map((item) => {
    const style = reminderStyleByCategory[item.category] ?? reminderStyleByCategory.Lainnya;
    return {
      ...item,
      icon: style.icon,
      color: style.color,
    };
  });
  const upcomingReminders = activeReminders.map((item) => ({
    id: item.id,
    icon: item.icon,
    title: item.title,
    note: `Dijadwalkan ${item.frequency}`,
    time: item.time,
    color: item.color,
  }));
  const reminderLogs = activeReminders.map((item, index) => {
    const completed = !reminderEnabled[item.title];
    const hour = String(7 + (index % 12)).padStart(2, "0");
    return { id: item.id, hour: `${hour}:00`, title: item.title, status: completed ? "Selesai" : "Belum selesai", color: item.color, icon: item.icon };
  });
  const smartReminderRows = hasAnyData
    ? [
      ["fa-person-walking", "Aktivitas Fisik", "Anda jarang mencapai target langkah harian", "emerald"],
      ["fa-bottle-water", "Minum Air", "Rata-rata konsumsi air kurang", "blue"],
      ["fa-heart-pulse", "Cek Tekanan Darah", "Tekanan darah perlu dipantau rutin", "rose"],
      ["fa-spa", "Kurangi Stres", "Tingkat stres Anda cukup tinggi", "violet"],
    ]
    : [];
  const visibleActivityRows = showAllActivity ? activityRowsLive : activityRowsLive.slice(0, 3);
  const visibleReminderLogs = showAllReminderLogs ? reminderLogs : reminderLogs.slice(0, 5);
  const visibleUpcomingReminders = showAllUpcoming ? upcomingReminders : upcomingReminders.slice(0, 3);
  const visibleSmartReminderRows = showAllRecommendations ? smartReminderRows : smartReminderRows.slice(0, 4);
  const reminderCategories = [
    ["fa-bell", "Semua", String(activeReminders.length), "emerald"],
    ["fa-heart-pulse", "Kesehatan", String(activeReminders.filter((item) => item.category === "Kesehatan").length), "rose"],
    ["fa-capsules", "Obat", String(activeReminders.filter((item) => item.category === "Obat").length), "violet"],
    ["fa-person-walking", "Aktivitas", String(activeReminders.filter((item) => item.category === "Aktivitas").length), "emerald"],
    ["fa-moon", "Tidur", String(activeReminders.filter((item) => item.category === "Tidur").length), "indigo"],
    ["fa-ellipsis", "Lainnya", String(activeReminders.filter((item) => item.category === "Lainnya" || item.category === "Minum").length), "slate"],
  ];
  const reminderStats = [
    ["fa-bell", "Total Pengingat", String(activeReminders.length), activeReminders.length > 0 ? "Semua pengingat" : "Belum ada pengingat", "emerald"],
    ["fa-circle-check", "Aktif", String(activeReminders.filter((item) => reminderEnabled[item.title]).length), activeReminders.length > 0 ? "Pengingat aktif" : "Belum aktif", "emerald"],
    ["fa-clock", "Akan Datang", String(upcomingReminders.length), upcomingReminders.length > 0 ? "Akan berbunyi" : "Tidak ada jadwal", "amber"],
    ["fa-check", "Selesai Hari Ini", String(reminderLogs.filter((log) => log.status === "Selesai").length), reminderLogs.length > 0 ? "Pengingat selesai" : "Belum ada selesai", "violet"],
  ];
  const staticHistoryRows = [
    [formatSampleDateTime(0, 8, 30), "Tekanan Darah", hasBloodPressure ? `${bloodPressure} mmHg` : "-", "Tekanan", bpStatus, "Diastolik 80", "Lihat"],
    [formatSampleDateTime(0, 8, 30), "Detak Jantung", hasHeartRate ? `${heartRate} bpm` : "-", "Jantung", hrStatus, "Sebelum aktivitas", "Lihat"],
    [formatSampleDateTime(0, 8, 30), "Berat Badan", hasWeight ? `${weight} kg` : "-", "Berat", hasWeight ? "Normal" : "-", "Pagi hari", "Lihat"],
    [formatSampleDateTime(0, 8, 30), "Tinggi Badan", hasHeight ? `${height} cm` : "-", "Tinggi", hasHeight ? "Normal" : "-", "Profil", "Lihat"],
    [formatSampleDateTime(0, 8, 30), "Aktivitas", hasSteps ? `${steps.toLocaleString("id-ID")} langkah` : "-", "Aktivitas", hasSteps ? "Baik" : "-", "Target 10.000", "Lihat"],
    [formatSampleDateTime(0, 8, 30), "Pola Makan", hasMealData ? `${totalMealCalories.toLocaleString("id-ID")} kkal` : "-", "Nutrisi", hasMealData ? "Baik" : "-", "Catatan harian", "Lihat"],
  ];
  const storedHistoryRows = measurementHistoryDb.flatMap((entry) => {
    const timestamp = formatLocalDateTime(entry.tanggal_pengukuran);
    const sourceLabel = entry.sumber_data === "esp32_s3" ? "ESP32-S3 UNO" : entry.sumber_data === "web_manual" ? "Web Manual" : entry.sumber_data === "web_sync" ? "Sinkronisasi Web" : "Aplikasi";
    const bpValue = `${entry.sistolik}/${entry.diastolik}`;
    const bpState = entry.sistolik < 90 || entry.diastolik < 60 ? "Rendah" : entry.sistolik <= 129 && entry.diastolik <= 84 ? "Normal" : entry.sistolik <= 139 || entry.diastolik <= 89 ? "Waspada" : "Tinggi";
    return [
      [timestamp, "Tekanan Darah", `${bpValue} mmHg`, "Tekanan", bpState, sourceLabel, "Lihat"],
      [timestamp, "Detak Jantung", `${entry.detak_jantung} bpm`, "Jantung", entry.detak_jantung > 0 ? (entry.detak_jantung <= 100 ? "Normal" : "Tinggi") : "-", sourceLabel, "Lihat"],
      [timestamp, "Berat Badan", `${entry.berat_badan} kg`, "Berat", entry.berat_badan > 0 ? "Normal" : "-", sourceLabel, "Lihat"],
      [timestamp, "Tinggi Badan", `${entry.tinggi_badan} cm`, "Tinggi", entry.tinggi_badan > 0 ? "Normal" : "-", sourceLabel, "Lihat"],
    ];
  });
  const measurementHistoryRows = measurementHistoryDb.map((entry) => ({
    ...entry,
    timestamp: formatLocalDateTime(entry.tanggal_pengukuran),
  }));
  const activityHistoryRowsForExport = activitySessionDocs.filter((session) => isMeaningfulActivitySession(session)).map((session) => {
    const timestamp = formatActivityFinishedAt(session.finished_at);
    const sourceLabel = session.source === "gps" ? "Aktivitas GPS" : "Aktivitas Estimasi";
    const statusLabel =
      Number(session.langkah) >= Number(targetPrefs.steps || 10000)
        ? "Target Tercapai"
        : Number(session.langkah) > 0
          ? "Terekam"
          : "-";

    return [
      timestamp,
      "Aktivitas",
      `${Number(session.langkah || 0).toLocaleString("id-ID")} langkah`,
      "Aktivitas",
      statusLabel,
      `${session.motion_label || "aktivitas"} • ${Math.round(Number(session.kalori) || 0)} kcal • ${((Number(session.distance_m) || 0) / 1000).toFixed(2)} km • ${sourceLabel}`,
      "Lihat",
    ];
  });
  const historyEventRows = historyEventDocs
    .filter((entry) => !shouldHideHistoryEventFromTimeline(entry))
    .map((entry) => [
      formatLocalDateTime(entry.occurredAt),
      entry.dataType,
      entry.value,
      entry.category,
      entry.status,
      entry.note || entry.source,
      entry.actionLabel || "Lihat",
    ]);
  const educationMealSummary = hasMealData
    ? `${mealCaloriesDisplay.toLocaleString("id-ID")} kkal, ${carbsDisplay.toLocaleString("id-ID")} g karbohidrat, ${proteinDisplay.toLocaleString("id-ID")} g protein, ${fatDisplay.toLocaleString("id-ID")} g lemak, ${fiberDisplay.toLocaleString("id-ID")} g serat`
    : "";
  const educationActivitySummary = totalActivitySteps > 0 ? `${totalActivitySteps.toLocaleString("id-ID")} langkah hari ini` : "";
  const educationHydrationSummary = waterGlasses > 0 ? `${waterGlasses} gelas air` : "";
  const latestEducationUserMessage =
    [...educationChatMessages].reverse().find((message) => message.role === "user")?.text || "";
  const educationContext = buildEducationContext({
    patientName: name,
    age: profile.age || calculateAgeFromBirthDate(profile.birthDate) || "",
    gender: profile.gender || "",
    location: profile.location || "",
    height: dashboardHeight > 0 ? dashboardHeight : height > 0 ? height : profileHeight,
    weight: dashboardWeight > 0 ? dashboardWeight : weight > 0 ? weight : profileWeight,
    bmi: dashboardBmi,
    bloodPressure: hasBloodPressure ? bloodPressure : "",
    bloodPressureStatus: bpStatus,
    heartRate: hasHeartRate ? heartRate : 0,
    heartRateStatus: hrStatus,
    steps: totalActivitySteps,
    waterGlasses,
    mealCalories: mealCaloriesDisplay,
    mealSummary: educationMealSummary,
    activitySummary: educationActivitySummary,
    hydrationSummary: educationHydrationSummary,
    latestMeasurementAt: dashboardBmiRecordedAt || "",
  });
  const liveEducationTopic = analyzeEducationTopic(educationChatInput || latestEducationUserMessage || "");
  const educationParameterChips = [
    hasBloodPressure ? "Tekanan darah aktif" : "Tekanan darah belum ada",
    hasHeartRate ? "Detak jantung aktif" : "Detak jantung belum ada",
    dashboardBmi > 0 ? `BMI ${dashboardBmi.toFixed(1)}` : "BMI menunggu data",
    totalActivitySteps > 0 ? `${totalActivitySteps.toLocaleString("id-ID")} langkah` : "Aktivitas belum ada",
    `Status ${educationContext.analysis.overallStatus}`,
  ];
  const educationQuickQuestions = [
    {
      label: "Cek BMI",
      question: "Berapa BMI saya dan apa artinya?",
    },
    {
      label: "Tips Minum Air",
      question: "Berapa saran minum air untuk saya hari ini?",
    },
    {
      label: "Tanya Gejala",
      question: "Saya merasa lelah, apa edukasi yang cocok?",
    },
  ];
  const topicLabelForUi = liveEducationTopic.label;
  const mergedHistoryRows = [...activityHistoryRowsForExport];
  const mergedHistoryKeys = new Set(historyEventRows.map((row) => `${row[0]}|${row[1]}|${row[2]}|${row[5]}`));
  const legacyRows = mergedHistoryRows.filter((row) => !mergedHistoryKeys.has(`${row[0]}|${row[1]}|${row[2]}|${row[5]}`));
  const historySourceRows = historyEventRows.length > 0 ? [...historyEventRows, ...legacyRows] : mergedHistoryRows.length > 0 ? mergedHistoryRows : [];
  const normalizedHistoryFilter = isAllowedRiwayatFilter(historyFilter) ? historyFilter : "Semua";
  const historyDetailRows = historySourceRows.filter((row) => normalizedHistoryFilter === "Semua" || row[1] === normalizedHistoryFilter);
  const reminderTabs = ["Semua", "Kesehatan", "Obat", "Aktivitas", "Lainnya"];
  const filteredActiveReminders =
    reminderTab === "Semua"
      ? activeReminders
      : activeReminders.filter((item) => {
        if (reminderTab === "Kesehatan") return item.category === "Kesehatan";
        if (reminderTab === "Obat") return item.category === "Obat";
        if (reminderTab === "Aktivitas") return item.category === "Aktivitas";
        return item.category === "Lainnya" || item.category === "Tidur" || item.category === "Minum";
      });
  const activeReminderCount = activeReminders.filter((item) => reminderEnabled[item.title]).length;
  const completedReminderCount = reminderLogs.filter((log) => log.status === "Selesai").length;
  const notificationCount = activeReminderCount;
  const headerDateText = formatLocalWeekdayDate(deviceNow);
  const headerTimeText = formatLocalTime(deviceNow);
  const profileHeightText = profile.height || (height > 0 ? String(height) : "");
  const profileWeightText = profile.weight || (weight > 0 ? String(weight) : "");
  const profileDetails = [
    ["Username", profile.username ? `@${profile.username}` : "-"],
    ["Tinggi Badan", withUnitOrDash(profileHeightText, "cm")],
    ["Berat Badan", withUnitOrDash(profileWeightText, "kg")],
    ["Tanggal Lahir", formatBirthDateLabel(profile.birthDate)],
    ["Golongan Darah", profile.bloodType || "-"],
    ["Lokasi", profile.location || "-"],
  ];
  const targetSettings = [
    ["Langkah Harian", `${Number(targetPrefs.steps).toLocaleString("id-ID")} langkah`],
    ["Kalori Harian", `${Number(targetPrefs.calories).toLocaleString("id-ID")} kkal`],
    ["Durasi Aktivitas", `${targetPrefs.duration} menit`],
    ["Minum Air", `${targetPrefs.water} gelas/hari`],
  ];
  const unitSettings = [
    ["Berat", unitPrefs.weight],
    ["Tinggi", unitPrefs.height],
    ["Jarak", unitPrefs.distance],
    ["Kalori", unitPrefs.calories],
  ];
  const helpArticles: Record<string, { summary: string; steps: string[]; tips: string[] }> = {
    "Cara menghubungkan ESP32-S3 UNO": {
      summary: "Gunakan panduan ini saat status alat masih Tidak Terhubung atau tinggi/berat badan belum masuk ke dashboard.",
      steps: [
        "Pastikan ESP32-S3 UNO menyala dan sensor tinggi/berat badan sudah terpasang.",
        "Hubungkan ESP32-S3 UNO ke internet menggunakan WiFi atau hotspot.",
        "Klik Connect Device agar user aktif langsung ditautkan ke alat.",
        "Gunakan Panel Device untuk melihat Kunci Alat unik yang dipakai di firmware.",
        "Pastikan firmware ESP32 mengirim data ke path device_stream di Firebase.",
      ],
      tips: ["Status Terhubung muncul setelah data alat masuk ke Firebase.", "Tensi dan detak jantung tetap diinput manual dari web."],
    },
    "Cara membaca data kesehatan": {
      summary: "Panduan singkat untuk memahami parameter kesehatan yang tampil di dashboard.",
      steps: [
        "Tinggi badan dan berat badan dipakai sebagai data profil dasar.",
        "Tekanan darah dibaca dalam format sistolik/diastolik, misalnya 120/80 mmHg.",
        "Detak jantung ditampilkan dalam bpm dan diberi status Rendah, Normal, atau Tinggi.",
        "Aktivitas dihitung dari jumlah langkah harian dan dibandingkan dengan target.",
        "Pola makan ditampilkan dalam kkal untuk memantau asupan harian.",
      ],
      tips: ["Gunakan menu Riwayat untuk melihat data detail.", "Status Waspada atau Tinggi sebaiknya dipantau lebih sering."],
    },
    "Mengatur pengingat dan alarm": {
      summary: "Atur pengingat kesehatan agar jadwal minum, aktivitas, dan pemeriksaan tidak terlewat.",
      steps: [
        "Buka menu Pengingat & Alarm.",
        "Klik Tambah Pengingat untuk membuat pengingat baru.",
        "Pilih kategori seperti minum air, obat, aktivitas, atau tidur.",
        "Atur jam dan frekuensi pengingat.",
        "Gunakan toggle di daftar pengingat untuk mengaktifkan atau menonaktifkan alarm.",
      ],
      tips: ["Rekomendasi Pengingat Pintar bisa ditambahkan cepat dari card rekomendasi.", "Pengaturan suara, getar, snooze, dan volume tersedia di bagian Pengaturan Alarm."],
    },
    "Mengubah profil akun": {
      summary: "Perbarui identitas dan data dasar tubuh Anda agar analisis lebih sesuai.",
      steps: [
        "Masuk ke menu Pengaturan.",
        "Klik tombol Edit Profil pada card Profil Akun.",
        "Ubah nama, email, nomor telepon, usia, lokasi, tinggi badan, atau berat badan.",
        "Klik Simpan Profil untuk menyimpan perubahan.",
        "Periksa kembali card Profil Akun untuk memastikan data sudah berubah.",
      ],
      tips: ["Tinggi dan berat badan dari profil dipakai di ringkasan kesehatan.", "Gunakan data terbaru agar rekomendasi lebih akurat."],
    },
  };

  useEffect(() => {
    if (!CORE_MENU_ITEMS.includes(activeMenu)) {
      setActiveMenu("Dashboard");
    }
  }, [activeMenu]);

  useEffect(() => {
    const timer = window.setInterval(() => setDeviceStatusTick((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const nextBloodPressure = getBloodPressureParts(effectiveLatest?.bloodPressure);
    setManualSystolic((current) => current || nextBloodPressure.systolic);
    setManualDiastolic((current) => current || nextBloodPressure.diastolic);
    setManualHeartRate((current) => current || (effectiveLatest?.heartRate && effectiveLatest.heartRate > 0 ? String(effectiveLatest.heartRate) : ""));
  }, [effectiveLatest?.bloodPressure, effectiveLatest?.heartRate]);

  useEffect(() => {
    if (!userUid || !storageReady) {
      setHealthPrediction(null);
      healthPredictionSignatureRef.current = "";
      return;
    }

    const profileAge = Number(profile.age) || Number(calculateAgeFromBirthDate(profile.birthDate)) || 0;
    const genderText = profile.gender.trim().toLowerCase();
    const genderCode = genderText.includes("laki") || genderText.includes("pria") || genderText.includes("male") || genderText === "1" ? 1 : 0;
    const systolicValue = Number(displayedSystolic) || Number(bloodPressure.split("/")[0]) || 0;
    const diastolicValue = Number(displayedDiastolic) || Number(bloodPressure.split("/")[1]) || 0;
    const predictionInput = {
      age: profileAge,
      gender: genderCode,
      height_cm: dashboardHeight,
      weight_kg: dashboardWeight,
      bmi: dashboardBmi,
      heart_rate: heartRate,
      systolic_bp: systolicValue,
      diastolic_bp: diastolicValue,
      steps: Number(steps) || 0,
    };

    const isReady =
      predictionInput.age > 0 &&
      predictionInput.gender >= 0 &&
      predictionInput.height_cm > 0 &&
      predictionInput.weight_kg > 0 &&
      predictionInput.bmi > 0 &&
      predictionInput.systolic_bp > 0 &&
      predictionInput.diastolic_bp > 0 &&
      predictionInput.heart_rate > 0;

    if (!isReady) {
      setHealthPrediction(null);
      healthPredictionSignatureRef.current = "";
      return;
    }

    const timer = window.setTimeout(() => {
      const result = predictHealthStatus(predictionInput);
      const signature = JSON.stringify(predictionInput);
      setHealthPrediction(result);

      if (healthPredictionSignatureRef.current === signature) {
        return;
      }

      healthPredictionSignatureRef.current = signature;
      void saveHealthPredictionForUser(userUid, result).catch((error) => {
        console.error("saveHealthPredictionForUser failed", error);
        healthPredictionSignatureRef.current = "";
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    bloodPressure,
    dashboardBmi,
    dashboardHeight,
    dashboardWeight,
    displayedDiastolic,
    displayedSystolic,
    heartRate,
    profile.age,
    profile.birthDate,
    profile.gender,
    steps,
    userUid,
  ]);

  const selectedHelpArticle = activeHelpArticle ? helpArticles[activeHelpArticle] : null;

  const manualValue = (value: string | number, unit: string) => (
    <div className="mt-4">
      <div className="flex items-end gap-2">
        <p className="text-[34px] font-black leading-none tracking-[-0.04em] text-slate-900 sm:text-[40px]">{value}</p>
        <p className="pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{unit}</p>
      </div>
      <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Ringkasan cepat</p>
    </div>
  );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructorLike;
      webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    };

    setEducationSpeechInputSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    setEducationSpeechOutputSupported(Boolean(window.speechSynthesis));

    return () => {
      educationSpeechRecognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const getSpeechRecognitionConstructor = () => {
    if (typeof window === "undefined") return null;
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructorLike;
      webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    };
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
  };

  const stopEducationVoiceOutput = () => {
    educationSpeechRecognitionRef.current?.abort();
    educationSpeechRecognitionRef.current = null;
    window.speechSynthesis?.cancel();
    educationSpeechUtteranceRef.current = null;
    setEducationListening(false);
    setEducationSpeaking(false);
  };

  const speakEducationAnswer = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      notify("Browser ini belum mendukung bacaan suara.");
      return;
    }

    if (educationSpeaking) {
      window.speechSynthesis.cancel();
      setEducationSpeaking(false);
      return;
    }

    const cleanText = text.trim();
    if (!cleanText || cleanText.includes("Asisten edukasi akan menjawab berdasarkan data kesehatan terbaru Anda.")) {
      notify("Belum ada jawaban edukasi yang bisa dibacakan.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "id-ID";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setEducationSpeaking(true);
    utterance.onend = () => {
      setEducationSpeaking(false);
      educationSpeechUtteranceRef.current = null;
    };
    utterance.onerror = () => {
      setEducationSpeaking(false);
      educationSpeechUtteranceRef.current = null;
    };
    educationSpeechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const startEducationVoiceInput = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      notify("Browser ini belum mendukung input suara.");
      return;
    }

    if (educationListening) {
      educationSpeechRecognitionRef.current?.stop();
      return;
    }

    stopEducationVoiceOutput();

    const recognition = new Recognition();
    recognition.lang = "id-ID";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      const safeTranscript = result?.[0]?.transcript?.trim?.() || "";
      if (safeTranscript) {
        setEducationChatInput(safeTranscript);
        void sendEducationChatMessage(safeTranscript);
      }
    };
    recognition.onerror = (event) => {
      setEducationListening(false);
      const error = event.error || "unknown";
      notify(error === "not-allowed" ? "Izin mikrofon ditolak." : "Input suara gagal diproses.");
    };
    recognition.onend = () => {
      setEducationListening(false);
      educationSpeechRecognitionRef.current = null;
    };

    educationSpeechRecognitionRef.current = recognition;
    setEducationListening(true);
    recognition.start();
    notify("Silakan bicara sekarang.");
  };

  const normalizeDeviceId = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-");

  const sendEducationChatMessage = async (prefilledMessage?: string) => {
    const nextText = (prefilledMessage ?? educationChatInput).trim();
    if (!nextText) return;

    const timestamp = new Date().toISOString();
    const userMessage: VirtualEducationMessage = {
      id: `user-${timestamp}`,
      role: "user",
      text: nextText,
      createdAt: timestamp,
    };
    const recentHistory = educationChatMessages.slice(-6).map((message) => ({
      role: message.role,
      text: message.text,
    }));
    setEducationChatInput(nextText);
    let assistantText = "";
    try {
      const educationReply = await sendEducationQuestionToAI({
        question: nextText,
        healthContext: educationContext,
        history: recentHistory,
      });
      assistantText = educationReply.answer;
    } catch {
      assistantText = "Maaf, saya belum bisa menjawab sekarang. Coba lagi sebentar ya.";
    }
    const assistantMessage: VirtualEducationMessage = {
      id: `assistant-${timestamp}`,
      role: "assistant",
      text: assistantText,
      createdAt: new Date(Date.now() + 1).toISOString(),
    };

    setEducationChatMessages((current) => [...current, userMessage, assistantMessage].slice(-EDUCATION_CHAT_MESSAGE_LIMIT));
    setEducationChatInput("");

    if (userUid && storageReady) {
      try {
        await Promise.all([
          createEducationChatMessageForUser(userUid, {
            role: userMessage.role,
            text: userMessage.text,
            createdAt: userMessage.createdAt,
          }),
          createEducationChatMessageForUser(userUid, {
            role: assistantMessage.role,
            text: assistantMessage.text,
            createdAt: assistantMessage.createdAt,
          }),
        ]);
      } catch {
        notify("Percakapan edukasi tetap berjalan, tetapi riwayat belum berhasil disimpan.");
      }
    }
  };

  const startEducationConversation = (question: string) => {
    void sendEducationChatMessage(question);
  };

  const educationStatusCards = [
    {
      label: "Status utama",
      value: educationContext.analysis.overallStatus,
      note: educationContext.analysis.overallRecommendation,
      icon: "fa-shield-heart",
      iconClass: "bg-sky-100 text-sky-700",
    },
    {
      label: "BMI",
      value: dashboardBmi > 0 ? dashboardBmi.toFixed(1) : "-",
      note: dashboardBmi > 0 ? educationContext.analysis.bmiStatus : "Menunggu data tinggi dan berat",
      icon: "fa-weight-scale",
      iconClass: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "Tekanan darah",
      value: hasBloodPressure ? bloodPressure : "-",
      note: hasBloodPressure ? educationContext.analysis.bloodPressureStatus : "Belum ada data tekanan darah",
      icon: "fa-heart-pulse",
      iconClass: "bg-rose-100 text-rose-700",
    },
    {
      label: "Denyut jantung",
      value: hasHeartRate ? `${heartRate}` : "-",
      note: hasHeartRate ? educationContext.analysis.heartRateStatus : "Belum ada data detak jantung",
      icon: "fa-heart",
      iconClass: "bg-indigo-100 text-indigo-700",
    },
    {
      label: "Hidrasi",
      value: waterGlasses > 0 ? `${waterGlasses} gelas` : "-",
      note: waterGlasses > 0 ? educationContext.analysis.hydrationStatus : "Belum ada data minum",
      icon: "fa-droplet",
      iconClass: "bg-blue-100 text-blue-700",
    },
  ];

  const connectDeviceToFirebase = async (requestedDeviceId = deviceIdInput, showPanelAfterConnect = false) => {
    if (!userUid || !storageReady) {
      setDeviceConnectError("User belum siap atau Firebase belum aktif.");
      return;
    }

    const normalizedDeviceId = normalizeDeviceId(requestedDeviceId || DEFAULT_DEVICE_ID);
    if (!normalizedDeviceId) {
      setDeviceConnectError("Device ID wajib diisi.");
      return;
    }

    try {
      setDeviceConnectSaving(true);
      setDeviceConnectError("");
      const nextWriteKey =
        deviceWriteKey.trim() ||
        (normalizedDeviceId === DEFAULT_DEVICE_ID ? DEFAULT_DEVICE_WRITE_KEY : "") ||
        generateDeviceWriteKey();
      const result = await linkDeviceToUser(userUid, {
        deviceId: normalizedDeviceId,
        userName: name,
        writeKey: nextWriteKey,
      });
      if (!result.ok) {
        setDeviceConnectError(result.message);
        return;
      }
      await publishDeviceDisplayRequest(normalizedDeviceId, name);

      setDeviceIdentity({
        connected: true,
        deviceId: normalizedDeviceId,
        userId: userUid,
        userName: name,
      });
      setDeviceIdInput(normalizedDeviceId);
      setDeviceWriteKey(nextWriteKey);
      setSyncTime("");
      setDeviceLastSeenAt("");
      if (showPanelAfterConnect) setConnectDeviceModalOpen(true);
      notify(`Device ${normalizedDeviceId} tertaut. Nama user tampil di LCD alat.`);
    } catch {
      setDeviceConnectError("Gagal menyimpan koneksi device ke Firebase.");
    } finally {
      setDeviceConnectSaving(false);
    }
  };

  useEffect(() => {
    if (!userUid || !storageReady || !deviceIdentity.connected || !deviceIdentity.deviceId) return;
    const unsubscribe = subscribeDevicePresence(
      deviceIdentity.deviceId,
      (presence) => {
        if (!presence?.lastSeenAt) return;

        const seenAt = presence.lastSeenAt;
        setDeviceLastSeenAt(seenAt);
        setSyncTime(formatLocalDateTime(seenAt));
      },
      (error) => {
        const code = String((error as { code?: string })?.code || "");
        if (code.includes("permission-denied")) {
          setDeviceConnectError("Status online alat dari Firebase tidak bisa dibaca.");
        }
      }
    );
    return () => unsubscribe();
  }, [deviceIdentity.connected, deviceIdentity.deviceId, userUid]);

  useEffect(() => {
    if (!userUid || !storageReady || !deviceIdentity.connected || !deviceIdentity.deviceId) return;
    const unsubscribe = subscribeDeviceStream(
      deviceIdentity.deviceId,
      async (rows) => {
        let processedCount = 0;
        for (const row of rows) {
          if (row.consumedAt || row.consumedByUid) continue;
          const processKey = `${deviceIdentity.deviceId}:${row.id}`;
          if (processingDeviceEntriesRef.current.has(processKey)) continue;

          processingDeviceEntriesRef.current.add(processKey);
          try {
            const bp = parseBloodPressure(row.bloodPressure || "0/0");
            const saveResult = await saveMeasurementForUser(userUid, {
              tinggi_badan: Number(row.height) || 0,
              berat_badan: Number(row.weight) || 0,
              bmi:
                Number(row.bmi) > 0
                  ? Number(row.bmi)
                  : Number(row.height) > 0 && Number(row.weight) > 0
                    ? Number((Number(row.weight) / Math.pow(Number(row.height) / 100, 2)).toFixed(1))
                    : 0,
              detak_jantung: Number(row.heartRate) || 0,
              sistolik: bp.sistolik,
              diastolik: bp.diastolik,
              langkah_kaki: Number(row.steps) || 0,
              pola_makan: "-",
              tanggal_pengukuran: row.createdAt || new Date().toISOString(),
              sumber_data: "esp32_s3",
            });
            if (saveResult.ok) {
              processedCount += 1;
              setDeviceLatest({
                height: Number(row.height) || 0,
                weight: Number(row.weight) || 0,
                bmi:
                  Number(row.bmi) > 0
                    ? Number(row.bmi)
                    : Number(row.height) > 0 && Number(row.weight) > 0
                      ? Number((Number(row.weight) / Math.pow(Number(row.height) / 100, 2)).toFixed(1))
                      : 0,
                heartRate: Number(row.heartRate) || 0,
                steps: Number(row.steps) || 0,
                bloodPressure: row.bloodPressure || "0/0",
              });
              setProfile((current) => ({
                ...current,
                height: Number(row.height) > 0 ? String(row.height) : current.height,
                weight: Number(row.weight) > 0 ? String(row.weight) : current.weight,
              }));
              setDraftProfile((current) => ({
                ...current,
                height: Number(row.height) > 0 ? String(row.height) : current.height,
                weight: Number(row.weight) > 0 ? String(row.weight) : current.weight,
              }));
              setDeviceEducation({
                score: Number(row.height) > 0 && Number(row.weight) > 0 ? 88 : 0,
                status: "Tersinkron",
                summary: "Data tinggi dan berat badan terbaru berhasil diterima dari ESP32-S3 UNO melalui Firebase.",
                recommendations: [
                  "Lanjutkan input tekanan darah dan detak jantung dari web agar data harian lengkap.",
                ],
              });
              const seenAt = row.createdAt || new Date().toISOString();
              setDeviceLastSeenAt(seenAt);
              setSyncTime(formatLocalDateTime(seenAt));
              await markDeviceStreamEntryConsumed(deviceIdentity.deviceId, row.id, userUid);
            }
          } finally {
            processingDeviceEntriesRef.current.delete(processKey);
          }
        }

        if (processedCount > 0) {
          notify(`Data alat ${deviceIdentity.deviceId} berhasil masuk ${processedCount} kali.`);
        }
      },
      (error) => {
        const code = String((error as { code?: string })?.code || "");
        if (code.includes("permission-denied")) {
          setDeviceConnectError("Stream alat dari Firebase tidak bisa dibaca.");
        }
      }
    );
    return () => unsubscribe();
  }, [deviceIdentity.connected, deviceIdentity.deviceId, userUid]);

  useEffect(() => {
    if (!isActivityRunning) return;
    const timer = window.setInterval(() => {
      setActivitySession((current) => {
        if (gpsStatus === "warming") {
          return current;
        }

        if (gpsStatus === "tracking") {
          return {
            ...current,
            steps: Math.max(current.steps, motionStepCountRef.current),
            durationSec: current.durationSec + 3,
          };
        }

        if (motionPermissionState === "granted" && current.type !== "Sepeda") {
          const bodyHeightCm = Math.max(120, Number(profile.height) || height || 170);
          const bodyWeightKg = Math.max(25, Number(profile.weight) || weight || 60);
          const nextMotionSteps = Math.max(current.steps, motionStepCountRef.current);
          const stepDelta = Math.max(0, nextMotionSteps - current.steps);
          if (stepDelta > 0) {
            const strideLengthMeters = resolveStrideLengthMeters(bodyHeightCm, current.type);
            const distanceGainMeters = stepDelta * strideLengthMeters;
            const speedMps = distanceGainMeters / 3;
            const met = resolveMetValueByType(current.type, speedMps);
            const caloriesGain = met * bodyWeightKg * (3 / 3600);

            setGpsSpeedMps(Number(speedMps.toFixed(2)));
            setGpsDetectedMotion(`${current.type} (sensor HP)`);
            return {
              ...current,
              steps: nextMotionSteps,
              distanceKm: Number((current.distanceKm + distanceGainMeters / 1000).toFixed(3)),
              calories: Number((current.calories + caloriesGain).toFixed(2)),
              durationSec: current.durationSec + 3,
            };
          }

          return {
            ...current,
            steps: nextMotionSteps,
            durationSec: current.durationSec + 3,
          };
        }

        const preset = activityPresets[current.type];
        const bodyHeightCm = Math.max(120, Number(profile.height) || height || 170);
        const bodyWeightKg = Math.max(25, Number(profile.weight) || weight || 60);
        const simulatedSpeed = preset.speedMin + Math.random() * (preset.speedMax - preset.speedMin);
        const cadencePerMinute = preset.cadenceMin + Math.random() * Math.max(0, preset.cadenceMax - preset.cadenceMin);
        const estimatedSteps = current.type === "Sepeda" ? 0 : Math.max(0, Math.round((cadencePerMinute / 60) * 3));
        const strideLengthMeters = resolveStrideLengthMeters(bodyHeightCm, current.type);
        const distanceGainMeters =
          current.type === "Sepeda"
            ? simulatedSpeed * 3
            : estimatedSteps * strideLengthMeters;
        const distanceGainKm = distanceGainMeters / 1000;
        const speedMps = current.type === "Sepeda" ? simulatedSpeed : distanceGainMeters / 3;
        const motion = current.type === "Sepeda" ? "sepeda" : current.type === "Lari" ? "lari" : "jalan kaki";
        const met = resolveMetValueByType(current.type, speedMps);
        const caloriesGain = met * bodyWeightKg * (3 / 3600);

        setGpsSpeedMps(Number(speedMps.toFixed(2)));
        setGpsDetectedMotion(`${current.type} (estimasi)`);
        return {
          ...current,
          steps: current.steps + estimatedSteps,
          distanceKm: Number((current.distanceKm + distanceGainKm).toFixed(3)),
          calories: Number((current.calories + caloriesGain).toFixed(2)),
          durationSec: current.durationSec + 3,
        };
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [gpsStatus, height, isActivityRunning, motionPermissionState, profile.height, profile.weight, weight]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateThemePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemPrefersDark(event.matches);
    };
    updateThemePreference(media);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateThemePreference);
      return () => media.removeEventListener("change", updateThemePreference);
    }
    media.addListener(updateThemePreference);
    return () => media.removeListener(updateThemePreference);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const updateViewport = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileViewport(event.matches);
    };
    updateViewport(media);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateViewport);
      return () => media.removeEventListener("change", updateViewport);
    }
    media.addListener(updateViewport);
    return () => media.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-app-theme", resolvedTheme);
    try {
      window.localStorage.setItem("sehatai-theme", theme);
    } catch {
      // Abaikan kalau storage diblokir browser.
    }
  }, [resolvedTheme, theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setDeviceNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const storedProfile = readLocalEditableProfile(
      profileStorageKey,
      buildDefaultEditableProfile({ initialName, userEmail: userEmail || "", latest: latest ?? null })
    );
    setProfile(storedProfile);
    setDraftProfile(storedProfile);
  }, [profileStorageKey]);

  useEffect(() => {
    writeLocalEditableProfile(profileStorageKey, profile);
  }, [profileStorageKey, profile]);

  useEffect(() => {
    const storedCalibration = readStore(activityCalibrationStorageKey, DEFAULT_ACTIVITY_CALIBRATION);
    setActivityCalibration(storedCalibration);
  }, [activityCalibrationStorageKey]);

  useEffect(() => {
    writeStore(activityCalibrationStorageKey, activityCalibration);
  }, [activityCalibrationStorageKey, activityCalibration]);

  useEffect(() => {
    if (height <= 0 && weight <= 0) return;
    setProfile((current) => {
      const nextHeight = current.height || (height > 0 ? String(height) : "");
      const nextWeight = current.weight || (weight > 0 ? String(weight) : "");
      if (nextHeight === current.height && nextWeight === current.weight) return current;
      return {
        ...current,
        height: nextHeight,
        weight: nextWeight,
      };
    });
  }, [height, weight]);

  useEffect(() => {
    return () => {
      clearGpsTracking();
      clearMotionTracking();
    };
  }, []);

  const applyProfileSync = (profileDoc: {
    nama: string;
    email: string;
    username?: string;
    username_lower?: string;
    umur: number;
    jenis_kelamin: string;
    tanggal_lahir?: string;
    golongan_darah?: string;
    no_telepon?: string;
    lokasi?: string;
    tinggi_badan?: number;
    berat_badan?: number;
  }) => {
    setProfile((current) => ({
      ...current,
      fullName: profileDoc.nama || current.fullName,
      username: profileDoc.username || profileDoc.username_lower || current.username,
      email: profileDoc.email || current.email,
      gender: profileDoc.jenis_kelamin || current.gender,
      age: profileDoc.umur > 0 ? String(profileDoc.umur) : calculateAgeFromBirthDate(profileDoc.tanggal_lahir || current.birthDate),
      birthDate: profileDoc.tanggal_lahir || current.birthDate,
      bloodType: profileDoc.golongan_darah || current.bloodType,
      phone: profileDoc.no_telepon || current.phone,
      location: profileDoc.lokasi || current.location,
      height: Number(profileDoc.tinggi_badan) > 0 ? String(profileDoc.tinggi_badan) : current.height,
      weight: Number(profileDoc.berat_badan) > 0 ? String(profileDoc.berat_badan) : current.weight,
    }));
    setDraftProfile((current) => ({
      ...current,
      fullName: profileDoc.nama || current.fullName,
      username: profileDoc.username || profileDoc.username_lower || current.username,
      email: profileDoc.email || current.email,
      gender: profileDoc.jenis_kelamin || current.gender,
      age: profileDoc.umur > 0 ? String(profileDoc.umur) : calculateAgeFromBirthDate(profileDoc.tanggal_lahir || current.birthDate),
      birthDate: profileDoc.tanggal_lahir || current.birthDate,
      bloodType: profileDoc.golongan_darah || current.bloodType,
      phone: profileDoc.no_telepon || current.phone,
      location: profileDoc.lokasi || current.location,
      height: Number(profileDoc.tinggi_badan) > 0 ? String(profileDoc.tinggi_badan) : current.height,
      weight: Number(profileDoc.berat_badan) > 0 ? String(profileDoc.berat_badan) : current.weight,
    }));
  };

  useEffect(() => {
    let mounted = true;
    const loadUserContext = async () => {
      if (!userUid || !storageReady) return;
      setHistoryLoading(true);
      try {
        const [profileResult, historyResult, activityResult, historyEventResult, educationChatResult, deviceLinkResult] = await Promise.allSettled([
          getUserProfile(userUid),
          getMeasurementHistory(userUid, 120),
          getActivitySessionsForUser(userUid, 80),
          getHistoryEventsForUser(userUid, 240),
          getEducationChatMessagesForUser(userUid, 120),
          getLinkedDeviceForUser(userUid),
        ]);
        if (!mounted) return;

        const profileDoc = profileResult.status === "fulfilled" ? profileResult.value : null;
        const historyRows = historyResult.status === "fulfilled" ? historyResult.value : [];
        const activitySessions = activityResult.status === "fulfilled" ? activityResult.value : [];
        const historyEvents = historyEventResult.status === "fulfilled" ? historyEventResult.value : [];
        const educationChatRows = educationChatResult.status === "fulfilled" ? educationChatResult.value : [];
        const linkedDevice = deviceLinkResult.status === "fulfilled" ? deviceLinkResult.value : null;

        const hasPermissionDenied =
          (profileResult.status === "rejected" && String((profileResult.reason as { code?: string })?.code || "").includes("permission-denied")) ||
          (historyResult.status === "rejected" && String((historyResult.reason as { code?: string })?.code || "").includes("permission-denied")) ||
          (activityResult.status === "rejected" && String((activityResult.reason as { code?: string })?.code || "").includes("permission-denied")) ||
          (historyEventResult.status === "rejected" && String((historyEventResult.reason as { code?: string })?.code || "").includes("permission-denied")) ||
          (educationChatResult.status === "rejected" && String((educationChatResult.reason as { code?: string })?.code || "").includes("permission-denied"));
        if (hasPermissionDenied) {
          notify("Login berhasil, tapi data profil lokal tidak bisa dimuat penuh.");
        }

        if (profileDoc) {
          applyProfileSync(profileDoc);
        } else {
          // Buat profil awal otomatis saat user login pertama kali agar menu Pengaturan langsung sinkron.
          const defaultProfileDoc = buildUserProfileDoc({
            nama: name,
            email: userEmail || profile.email,
            username: profile.username,
            tanggal_lahir: profile.birthDate,
            jenis_kelamin: profile.gender,
            golongan_darah: profile.bloodType,
            no_telepon: profile.phone,
            lokasi: profile.location,
            tinggi_badan: Number(profile.height) || 0,
            berat_badan: Number(profile.weight) || 0,
          });
          await saveUserProfile(userUid, defaultProfileDoc);
          if (mounted) applyProfileSync(defaultProfileDoc);
        }

        setMeasurementHistoryDb(historyRows);
        setHistoryEventDocs(historyEvents);
        setEducationChatMessages(educationChatRows.map(toVirtualEducationMessage));
        if (activitySessions.length > 0) {
          setActivitySessionDocs(activitySessions);
          const mappedRows = activitySessions.map((session) => [
            "[DB]",
            `Sesi ${session.motion_label || "aktivitas"}`,
            formatActivityFinishedAt(session.finished_at),
            `${((Number(session.distance_m) || 0) / 1000).toFixed(2)} km`,
            formatDuration(Number(session.duration_sec) || 0),
            `${Math.round(Number(session.kalori) || 0)} kcal`,
          ]);
          setActivityHistory(mappedRows);
          const latestSession = activitySessions[0];
          setLastSessionInfo({
            speedAvgMps: Number(latestSession.speed_avg_mps) || 0,
            source: latestSession.source === "gps" ? "gps" : "fallback",
            finishedAt: latestSession.finished_at || "",
            motionLabel: latestSession.motion_label || "aktivitas",
          });
        } else {
          setActivitySessionDocs([]);
        }
        if (historyRows.length > 0) {
          const newest = historyRows[0];
          setDeviceLatest({
            height: newest.tinggi_badan,
            weight: newest.berat_badan,
            bmi: Number(newest.bmi) || 0,
            heartRate: newest.detak_jantung,
            steps: newest.langkah_kaki,
            bloodPressure: `${newest.sistolik}/${newest.diastolik}`,
          });
          if (newest.sumber_data === "esp32_s3") {
            setDeviceLastSeenAt(newest.tanggal_pengukuran);
            setSyncTime(formatLocalDateTime(newest.tanggal_pengukuran));
          }
        }
        if (linkedDevice?.deviceId) {
          setDeviceIdentity({
            connected: true,
            deviceId: linkedDevice.deviceId,
            userId: linkedDevice.uid || userUid,
            userName: linkedDevice.userName || name,
          });
          setDeviceIdInput(linkedDevice.deviceId);
          setDeviceWriteKey(linkedDevice.writeKey || "");
        }
      } catch (error) {
        if (!mounted) return;
        const code = String((error as { code?: string })?.code || "");
        if (code.includes("permission-denied")) {
          notify("Login berhasil, tapi data profil lokal tidak bisa dimuat penuh.");
          return;
        }
        notify("Gagal memuat data riwayat lokal.");
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    };
    void loadUserContext();
    return () => {
      mounted = false;
    };
  }, [userUid]);

  useEffect(() => {
    if (!userUid || !storageReady) return;
    const unsubscribe = subscribeUserProfile(userUid, (profileDoc) => {
      if (!profileDoc) return;
      applyProfileSync(profileDoc);
    });
    return () => unsubscribe();
  }, [userUid]);

  useEffect(() => {
    if (!userUid || !storageReady) return;
    const unsubscribe = subscribeMeasurementHistory(
      userUid,
      (rows) => {
        setMeasurementHistoryDb(rows);
        rows
          .filter((row) => !(Number(row.bmi) > 0) && Number(row.tinggi_badan) > 0 && Number(row.berat_badan) > 0)
          .slice(0, 20)
          .forEach((row) => {
            const backfillKey = `${userUid}:${row.id}`;
            if (bmiBackfillRef.current.has(backfillKey)) return;
            bmiBackfillRef.current.add(backfillKey);
            const nextBmi = Number((Number(row.berat_badan) / Math.pow(Number(row.tinggi_badan) / 100, 2)).toFixed(1));
            void updateMeasurementBmiForUser(userUid, row.id, nextBmi).finally(() => {
              bmiBackfillRef.current.delete(backfillKey);
            });
          });
        if (rows.length === 0) return;
        const newest = rows[0];
        setDeviceLatest({
          height: newest.tinggi_badan,
          weight: newest.berat_badan,
          bmi:
            Number(newest.bmi) > 0
              ? Number(newest.bmi)
              : Number(newest.tinggi_badan) > 0 && Number(newest.berat_badan) > 0
                ? Number((Number(newest.berat_badan) / Math.pow(Number(newest.tinggi_badan) / 100, 2)).toFixed(1))
                : 0,
          heartRate: newest.detak_jantung,
          steps: newest.langkah_kaki,
          bloodPressure: `${newest.sistolik}/${newest.diastolik}`,
        });
        if (newest.sumber_data === "esp32_s3") {
          setDeviceLastSeenAt(newest.tanggal_pengukuran);
          setSyncTime(formatLocalDateTime(newest.tanggal_pengukuran));
        }
      },
      (error) => {
        const code = String((error as { code?: string })?.code || "");
        if (code.includes("permission-denied")) {
          notify("Pengukuran realtime tidak bisa dibaca.");
        }
      },
      120
    );
    return () => unsubscribe();
  }, [userUid]);

  useEffect(() => {
    if (!userUid || !storageReady) return;
    const unsubscribe = subscribeRemindersForUser(
      userUid,
      (rows) => {
        setReminderDocs(rows);
        setReminderEnabled(
          rows.reduce<Record<string, boolean>>((result, item) => {
            result[item.title] = item.isEnabled;
            return result;
          }, {})
        );
      },
      (error) => {
        const code = String((error as { code?: string })?.code || "");
        if (code.includes("permission-denied")) {
          notify("Pengingat lokal tidak bisa dibaca.");
        }
      }
    );
    return () => unsubscribe();
  }, [userUid]);

  useEffect(() => {
    if (!userUid || !storageReady) return;
    const unsubscribe = subscribeHistoryEventsForUser(
      userUid,
      (rows) => {
        setHistoryEventDocs(rows);
      },
      (error) => {
        const code = String((error as { code?: string })?.code || "");
        if (code.includes("permission-denied")) {
          notify("Riwayat realtime tidak bisa dibaca.");
        }
      }
    );
    return () => unsubscribe();
  }, [userUid]);

  useEffect(() => {
    if (!userUid || !storageReady) return;
    const unsubscribe = subscribeEducationChatMessagesForUser(
      userUid,
      (rows) => {
        setEducationChatMessages(filterEducationMessages(rows.map(toVirtualEducationMessage)).slice(-EDUCATION_CHAT_MESSAGE_LIMIT));
      },
      (error) => {
        const code = String((error as { code?: string })?.code || "");
        if (code.includes("permission-denied")) {
          notify("Percakapan edukasi tidak bisa dibaca.");
        }
      }
    );
    return () => unsubscribe();
  }, [userUid]);

  useEffect(() => {
    if (!userUid || !storageReady) return;
    if (educationChatMessages.length > 0) return;
  // Biarkan state tetap kosong tanpa setState agar tidak memicu loop rerender.
  }, [educationChatMessages.length, userUid]);

  useEffect(() => {
    if (activeMenu !== "Edukasi") return;
    educationChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMenu, educationChatMessages.length]);

  const parseBloodPressure = (value: string) => {
    const [sysRaw, diaRaw] = String(value || "0/0").split("/");
    return {
      sistolik: Math.max(0, Number(sysRaw) || 0),
      diastolik: Math.max(0, Number(diaRaw) || 0),
    };
  };

  const getMeasurementSummaryParts = (payload: {
    tinggi_badan: number;
    berat_badan: number;
    detak_jantung: number;
    sistolik: number;
    diastolik: number;
  }) => {
    const parts: string[] = [];
    if (Number(payload.tinggi_badan) > 0) parts.push(`TB ${payload.tinggi_badan} cm`);
    if (Number(payload.berat_badan) > 0) parts.push(`BB ${payload.berat_badan} kg`);
    if (Number(payload.sistolik) > 0 && Number(payload.diastolik) > 0) parts.push(`TD ${payload.sistolik}/${payload.diastolik} mmHg`);
    if (Number(payload.detak_jantung) > 0) parts.push(`DJ ${payload.detak_jantung} bpm`);
    return parts;
  };

  const buildMeasurementHistoryEvent = (
    payload: {
      tinggi_badan: number;
      berat_badan: number;
      detak_jantung: number;
      sistolik: number;
      diastolik: number;
      tanggal_pengukuran: string;
    },
    config: {
      dataType: "Pengukuran" | "Sinkronisasi Alat";
      category: string;
      status: string;
      source: string;
      sourceLabel: string;
    }
  ) => {
    const summaryParts = getMeasurementSummaryParts(payload);
    if (summaryParts.length === 0) return null;

    return {
      occurredAt: payload.tanggal_pengukuran,
      dataType: config.dataType,
      value: summaryParts.length === 1 ? summaryParts[0] : `${summaryParts.length} parameter`,
      category: config.category,
      status: config.status,
      note: `${summaryParts.join(" • ")} • ${config.sourceLabel}`,
      actionLabel: "Lihat",
      source: config.source,
    } satisfies Omit<HistoryEventDoc, "createdAt">;
  };

  const isMeaningfulActivitySession = (session: {
    langkah: number;
    distance_m: number;
    kalori: number;
  }) => Number(session.langkah) > 0 || Number(session.distance_m) > 0 || Number(session.kalori) > 0;

  function shouldHideHistoryEventFromTimeline(entry: HistoryEventDoc) {
    if (LEGACY_PARAMETER_HISTORY_TYPES.has(entry.dataType) && MEASUREMENT_DERIVED_HISTORY_SOURCES.has(entry.source)) {
      return true;
    }

    if ((entry.dataType === "Aktivitas" || entry.dataType === "Pola Makan") && MEASUREMENT_DERIVED_HISTORY_SOURCES.has(entry.source)) {
      return true;
    }

    if (entry.source === "hydration") {
      return !/\d/.test(entry.value) || Number.parseInt(entry.value, 10) <= 0;
    }

    if (entry.source === "meal_note") {
      return normalizeHistoryText(entry.value) === "-" || normalizeHistoryText(entry.value) === "";
    }

    return false;
  }

  const isDuplicateHistoryEvent = (
    entry: Omit<HistoryEventDoc, "createdAt">,
    queuedEntries: Array<Omit<HistoryEventDoc, "createdAt">>
  ) => {
    const incomingTime = new Date(entry.occurredAt).getTime();
    const incomingValue = normalizeHistoryText(entry.value);
    const incomingNote = normalizeHistoryText(entry.note);

    const matches = (item: Pick<HistoryEventDoc, "occurredAt" | "dataType" | "source" | "value" | "note">) => {
      if (item.dataType !== entry.dataType || item.source !== entry.source) return false;
      if (normalizeHistoryText(item.value) !== incomingValue) return false;
      if (normalizeHistoryText(item.note) !== incomingNote) return false;
      const itemTime = new Date(item.occurredAt).getTime();
      return Number.isFinite(incomingTime) && Number.isFinite(itemTime) && Math.abs(incomingTime - itemTime) <= 120000;
    };

    return historyEventDocs.some(matches) || queuedEntries.some(matches);
  };

  const appendHistoryEvents = async (entries: Array<Omit<HistoryEventDoc, "createdAt">>) => {
    if (!userUid || !storageReady || entries.length === 0) return;
    const queuedEntries: Array<Omit<HistoryEventDoc, "createdAt">> = [];
    const validEntries = entries.filter((entry) => {
      if (shouldHideHistoryEventFromTimeline(entry as HistoryEventDoc)) return false;
      if (normalizeHistoryText(entry.value) === "-" && normalizeHistoryText(entry.note) === "-") return false;
      if (isDuplicateHistoryEvent(entry, queuedEntries)) return false;
      queuedEntries.push(entry);
      return true;
    });

    if (validEntries.length === 0) return;
    await Promise.all(validEntries.map((entry) => createHistoryEventForUser(userUid, entry)));
  };

  const clearMotionTracking = () => {
    if (typeof window !== "undefined" && motionStepListenerRef.current) {
      window.removeEventListener("devicemotion", motionStepListenerRef.current);
    }
    motionStepListenerRef.current = null;
    motionStepCountRef.current = 0;
    motionLastPeakAtRef.current = 0;
    motionBaselineRef.current = 9.81;
    motionMagnitudeWindowRef.current = [];
    setMotionStepCount(0);
  };

  const updateStrideCalibration = (mode: "Jalan" | "Lari" | "Sepeda", distanceMeters: number, stepCount: number) => {
    if (mode === "Sepeda") return;
    if (!Number.isFinite(distanceMeters) || distanceMeters < 20 || stepCount < 12) return;

    const bodyHeightCm = Math.max(120, Number(profile.height) || height || 170);
    const baseStride = resolveBaseStrideLengthMeters(bodyHeightCm, mode);
    if (!Number.isFinite(baseStride) || baseStride <= 0) return;

    const observedStride = distanceMeters / stepCount;
    const observedMultiplier = Math.max(0.75, Math.min(1.35, observedStride / baseStride));

    setActivityCalibration((current) => ({
      lastUpdatedAt: new Date().toISOString(),
      strideMultiplier: {
        ...current.strideMultiplier,
        [mode]: Number((((current.strideMultiplier[mode] || 1) * 0.7 + observedMultiplier * 0.3)).toFixed(3)),
      },
    }));
  };

  const startMotionStepTracking = async () => {
    clearMotionTracking();

    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setMotionPermissionState("unavailable");
      return false;
    }

    const deviceMotionEventCtor = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    const alreadyGranted = motionPermissionState === "granted";
    if (!alreadyGranted && typeof deviceMotionEventCtor.requestPermission === "function") {
      try {
        setMotionPermissionState("requesting");
        const permission = await deviceMotionEventCtor.requestPermission();
        if (permission !== "granted") {
          setMotionPermissionState("denied");
          return false;
        }
      } catch {
        setMotionPermissionState("denied");
        return false;
      }
    }

    setMotionPermissionState("granted");

    const listener = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity || event.acceleration;
      if (!acceleration || activityModeRef.current === "Sepeda") return;

      const x = Number(acceleration.x) || 0;
      const y = Number(acceleration.y) || 0;
      const z = Number(acceleration.z) || 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      motionMagnitudeWindowRef.current = [...motionMagnitudeWindowRef.current.slice(-11), magnitude];

      const averageMagnitude =
        motionMagnitudeWindowRef.current.reduce((total, value) => total + value, 0) /
        Math.max(1, motionMagnitudeWindowRef.current.length);
      const variance =
        motionMagnitudeWindowRef.current.reduce((total, value) => total + (value - averageMagnitude) ** 2, 0) /
        Math.max(1, motionMagnitudeWindowRef.current.length);
      const activityTypeLabel = activityModeRef.current;
      const baseThreshold = activityTypeLabel === "Lari" ? 1.05 : 0.8;
      const dynamicThreshold = Math.max(baseThreshold, Math.sqrt(variance) * (activityTypeLabel === "Lari" ? 1.25 : 1.1));
      const deviation = Math.abs(magnitude - motionBaselineRef.current);
      const now = Date.now();
      const minGap = activityTypeLabel === "Lari" ? 220 : 300;

      motionBaselineRef.current = motionBaselineRef.current * 0.9 + magnitude * 0.1;
      if (deviation < dynamicThreshold || now - motionLastPeakAtRef.current < minGap) return;

      motionLastPeakAtRef.current = now;
      motionStepCountRef.current += 1;
      setMotionStepCount(motionStepCountRef.current);
      setActivitySession((current) =>
        current.type === "Sepeda"
          ? current
          : {
              ...current,
              steps: Math.max(current.steps, motionStepCountRef.current),
            }
      );
    };

    motionStepListenerRef.current = listener;
    window.addEventListener("devicemotion", listener);
    return true;
  };

  const clearGpsTracking = () => {
    if (typeof navigator !== "undefined" && "geolocation" in navigator && gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    }
    gpsWatchIdRef.current = null;
    gpsLastPointRef.current = null;
    gpsLastTimestampRef.current = null;
    gpsAcceptedSamplesRef.current = 0;
    gpsAccuracyWindowRef.current = [];
  };

  const startGpsTracking = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsStatus("unsupported");
      setGpsErrorMessage("Perangkat/browser belum mendukung GPS. Jarak dihitung dari estimasi langkah.");
      setGpsSpeedMps(0);
      setGpsDetectedMotion("Belum terdeteksi");
      return false;
    }

    setGpsStatus("warming");
    setGpsErrorMessage("");
    setGpsSpeedMps(0);
    setGpsDetectedMotion("Belum terdeteksi");
    setGpsLastPointLabel("Menunggu GPS stabil...");
    gpsLastPointRef.current = null;
    gpsLastTimestampRef.current = null;
    gpsAcceptedSamplesRef.current = 0;
    gpsAccuracyWindowRef.current = [];

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const selectedMode = activityModeRef.current;
        const rawPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const accuracyMeters = Math.max(0, Number(position.coords.accuracy) || 0);
        gpsAccuracyWindowRef.current = [...gpsAccuracyWindowRef.current.slice(-4), accuracyMeters];
        const averageAccuracy =
          gpsAccuracyWindowRef.current.reduce((total, value) => total + value, 0) /
          Math.max(1, gpsAccuracyWindowRef.current.length);
        if (accuracyMeters > 12 || averageAccuracy > 10) {
          setGpsErrorMessage(`GPS belum stabil (${Math.round(accuracyMeters)} m). Tunggu sebentar sampai sinyal lebih rapat.`);
          setGpsStatus("warming");
          return;
        }

        const previousPoint = gpsLastPointRef.current;
        const previousTimestamp = gpsLastTimestampRef.current;
        const smoothingWeight = accuracyMeters <= 5 ? 0.82 : accuracyMeters <= 9 ? 0.58 : 0.4;
        const currentPoint = smoothCoordinatePoint(previousPoint, rawPoint, smoothingWeight);
        setGpsLastPointLabel(`${currentPoint.latitude.toFixed(5)}, ${currentPoint.longitude.toFixed(5)} • ±${Math.round(accuracyMeters)}m`);
        gpsLastPointRef.current = currentPoint;
        gpsLastTimestampRef.current = position.timestamp;

        if (!previousPoint || !previousTimestamp) {
          gpsAcceptedSamplesRef.current += 1;
          if (gpsAcceptedSamplesRef.current < 3) {
            setGpsErrorMessage("Menunggu GPS stabil dan mengunci titik awal...");
            setGpsStatus("warming");
          } else {
            setGpsErrorMessage("");
            setGpsStatus("tracking");
          }
          return;
        }

        const deltaSeconds = Math.max(0, (position.timestamp - previousTimestamp) / 1000);
        if (deltaSeconds < 2) return;

        const segmentMeters = calculateDistanceMeters(previousPoint, currentPoint);
        const minimumMovement = Math.max(4, Math.min(7, averageAccuracy * 0.38));
        if (!Number.isFinite(segmentMeters) || segmentMeters < minimumMovement) return;

        const browserSpeed = Number(position.coords.speed);
        const derivedSpeed = segmentMeters / deltaSeconds;
        const speedMps =
          Number.isFinite(browserSpeed) && browserSpeed > 0 && browserSpeed < 12
            ? (browserSpeed + derivedSpeed) / 2
            : derivedSpeed;
        const speedBounds = resolveModeSpeedBounds(selectedMode);
        const minMovementSpeed = selectedMode === "Sepeda" ? 2.2 : selectedMode === "Lari" ? 1.55 : 0.42;
        // Filter lonjakan sinyal GPS yang tidak realistis untuk mode yang dipilih.
        if (!Number.isFinite(speedMps) || speedMps < minMovementSpeed || speedMps > speedBounds.max) return;

        const motion =
          selectedMode === "Sepeda"
            ? "sepeda"
            : selectedMode === "Lari"
              ? "lari"
              : speedMps < speedBounds.min
                ? "jalan kaki pelan"
                : "jalan kaki";
        const met = resolveMetValueByType(selectedMode, speedMps);
        const bodyHeightCm = Math.max(120, Number(profile.height) || height || 170);
        const bodyWeightKg = Math.max(25, Number(profile.weight) || weight || 60);
        const caloriesGain = met * bodyWeightKg * (deltaSeconds / 3600);

        setGpsErrorMessage("");
        setGpsStatus("tracking");
        setGpsSpeedMps(Number(speedMps.toFixed(2)));
        setGpsDetectedMotion(`${selectedMode} (GPS)`);
        setActivitySession((current) => ({
          ...current,
          distanceKm: Number((current.distanceKm + segmentMeters / 1000).toFixed(3)),
          steps:
            motionStepCountRef.current > 0 && selectedMode !== "Sepeda"
              ? Math.max(current.steps, motionStepCountRef.current)
              : current.steps + estimateStepsFromDistance(segmentMeters, bodyHeightCm, selectedMode, motion),
          calories: Number((current.calories + caloriesGain).toFixed(2)),
        }));
      },
      (error) => {
        clearGpsTracking();
        setGpsSpeedMps(0);
        setGpsDetectedMotion("Belum terdeteksi");
        if (error.code === error.PERMISSION_DENIED) {
          setGpsStatus("denied");
          setGpsErrorMessage("Izin lokasi ditolak. Jarak sementara dihitung dari estimasi langkah.");
        } else {
          setGpsStatus("fallback");
          setGpsErrorMessage("GPS belum stabil. Jarak sementara dihitung dari estimasi langkah.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return true;
  };

  const startActivitySession = () => {
    if (isActivityRunning) return;
    clearGpsTracking();
    clearMotionTracking();
    setGpsSpeedMps(0);
    setGpsDetectedMotion("Belum terdeteksi");
    activityModeRef.current = activityType;
    const startedAtIso = new Date().toISOString();
    setActivitySession({
      steps: 0,
      distanceKm: 0,
      calories: 0,
      durationSec: 0,
      startedAt: formatLocalDateTime(startedAtIso),
      startedAtIso,
      type: activityType,
    });
    startGpsTracking();
    void startMotionStepTracking();
    setIsActivityRunning(true);
    notify(`Aktivitas ${activityType.toLowerCase()} dimulai. Menunggu GPS stabil sebelum data dihitung.`);
  };

  const stopActivitySession = async () => {
    if (!isActivityRunning) return;
    const finalStepCount = Math.max(activitySession.steps, motionStepCountRef.current);
    const finalizedSession = {
      ...activitySession,
      steps: finalStepCount,
    };
    const finalMotionLabel = gpsDetectedMotion !== "Belum terdeteksi" ? gpsDetectedMotion : finalizedSession.type;
    const finishedAtIso = new Date().toISOString();
    const sessionSource: "gps" | "fallback" = gpsStatus === "tracking" ? "gps" : "fallback";
    clearGpsTracking();
    clearMotionTracking();
    setGpsStatus("idle");
    setGpsErrorMessage("");
    setGpsLastPointLabel("-");
    setGpsSpeedMps(0);
    setGpsDetectedMotion("Belum terdeteksi");
    setActivitySession((current) => ({
      ...current,
      steps: finalStepCount,
    }));
    setIsActivityRunning(false);
    if (finalizedSession.durationSec > 0) {
      const finishedAt = formatLocalDateTime(finishedAtIso);
      const distanceMeters = Math.max(0, Math.round(finalizedSession.distanceKm * 1000));
      const avgSpeed = finalizedSession.durationSec > 0 ? distanceMeters / finalizedSession.durationSec : 0;
      setActivityHistory((rows) => [
        ["[OK]", `Sesi ${finalMotionLabel}`, finishedAt, `${finalizedSession.distanceKm.toFixed(2)} km`, formatDuration(finalizedSession.durationSec), `${Math.round(finalizedSession.calories)} kcal`],
        ...rows,
      ]);
      setLastSessionInfo({
        speedAvgMps: Number(avgSpeed.toFixed(2)),
        source: sessionSource,
        finishedAt: finishedAtIso,
        motionLabel: finalMotionLabel,
      });
      if (sessionSource === "gps") {
        updateStrideCalibration(finalizedSession.type, distanceMeters, finalStepCount);
      }

      if (userUid && storageReady) {
        const saveResult = await saveActivitySessionForUser(userUid, {
          started_at: finalizedSession.startedAtIso || finishedAtIso,
          finished_at: finishedAtIso,
          duration_sec: finalizedSession.durationSec,
          distance_m: distanceMeters,
          speed_avg_mps: Number(avgSpeed.toFixed(2)),
          motion_label: finalMotionLabel,
          langkah: finalStepCount,
          kalori: finalizedSession.calories,
          source: sessionSource,
        });
        if (!saveResult.ok) {
          notify(saveResult.message);
        } else {
          setActivitySessionDocs((rows) => [{ id: saveResult.id, ...saveResult.payload }, ...rows]);
          if (isMeaningfulActivitySession(saveResult.payload)) {
            const distanceKm = ((Number(saveResult.payload.distance_m) || 0) / 1000).toFixed(2);
            const activityValue =
              Number(saveResult.payload.langkah || 0) > 0
                ? `${Number(saveResult.payload.langkah || 0).toLocaleString("id-ID")} langkah`
                : `${distanceKm} km`;
            await appendHistoryEvents([
              {
                occurredAt: finishedAtIso,
                dataType: "Aktivitas",
                value: activityValue,
                category: "Aktivitas",
                status: Number(saveResult.payload.langkah || 0) >= Number(targetPrefs.steps || 10000) ? "Target Tercapai" : "Terekam",
                note: `${finalMotionLabel} • ${Math.round(Number(finalizedSession.calories) || 0)} kcal • ${finalizedSession.distanceKm.toFixed(2)} km`,
                actionLabel: "Lihat",
                source: sessionSource === "gps" ? "gps" : "fallback",
              },
            ]);
          }
        }
      }
    }
    notify("Aktivitas dihentikan. Data berhenti masuk.");
  };

  const syncDeviceData = async () => {
    if (!isDeviceConnected) {
      notify("Perangkat belum terhubung. Silakan klik Connect Device terlebih dahulu.");
      return;
    }
    try {
      const latestDeviceHeight = Number((deviceLatest ?? effectiveLatest)?.height || profile.height || 0);
      const latestDeviceWeight = Number((deviceLatest ?? effectiveLatest)?.weight || profile.weight || 0);
      const latestDeviceBmi =
        latestDeviceHeight > 0 && latestDeviceWeight > 0
          ? Number((latestDeviceWeight / Math.pow(latestDeviceHeight / 100, 2)).toFixed(1))
          : 0;
      const manualBloodPressure = bloodPressure && bloodPressure !== "0/0" ? bloodPressure : "0/0";
      const manualHeartRate = Number(heartRate) || 0;
      const latestSteps = Number((deviceLatest ?? effectiveLatest)?.steps || 0);

      setDeviceLatest({
        height: latestDeviceHeight,
        weight: latestDeviceWeight,
        bmi: latestDeviceBmi,
        heartRate: manualHeartRate,
        steps: latestSteps,
        bloodPressure: manualBloodPressure,
      });
      setDeviceEducation((current) => ({
        score: current.score > 0 ? current.score : 82,
        status: latestDeviceHeight > 0 || latestDeviceWeight > 0 ? "Tersinkron" : "Menunggu data alat",
        summary: "ESP32-S3 UNO menyuplai tinggi dan berat badan. Tekanan darah dan detak jantung tetap memakai input manual dari web.",
        recommendations: current.recommendations.length > 0 ? current.recommendations : ["Pastikan sensor tinggi/berat stabil", "Isi tensi dari Omron di web", "Isi detak jantung manual bila tersedia"],
      }));
      setSyncTime(formatLocalDateTime(new Date()));
      const bp = parseBloodPressure(manualBloodPressure);
      const generated = {
        tinggi_badan: latestDeviceHeight,
        berat_badan: latestDeviceWeight,
        bmi: latestDeviceBmi,
        detak_jantung: manualHeartRate,
        sistolik: bp.sistolik,
        diastolik: bp.diastolik,
        langkah_kaki: latestSteps,
        pola_makan: mealNote.trim() || "-",
        tanggal_pengukuran: new Date().toISOString(),
        sumber_data: "esp32_s3" as const,
      };

      if (userUid && storageReady) {
        const saveResult = await saveMeasurementForUser(userUid, generated);
        if (saveResult.ok) {
          setMeasurementHistoryDb((rows) => [{ id: saveResult.id, ...saveResult.payload }, ...rows]);
          const historyEntry = buildMeasurementHistoryEvent(saveResult.payload, {
            dataType: "Sinkronisasi Alat",
            category: "Device",
            status: "Tersinkron",
            source: "device_sync_event",
            sourceLabel: "ESP32-S3 UNO",
          });
          if (historyEntry) {
            try {
              await appendHistoryEvents([historyEntry]);
            } catch {
              notify("Pengukuran alat tersimpan, tetapi event riwayat belum berhasil ditambahkan.");
            }
          }
        }
      }

      notify("Sinkronisasi ESP32 berhasil. Tinggi/berat dari alat, tensi/detak jantung dari input web.");
    } catch (error) {
      console.error("syncDeviceData failed", error);
      notify("Sinkronisasi alat gagal. Coba lagi beberapa saat.");
    }
  };

  const saveManualMeasurement = async () => {
    try {
      const savedAtLabel = formatLocalDateTime(new Date());
      setManualSavedAt(savedAtLabel);

      if (userUid && storageReady) {
        const bp = parseBloodPressure(bloodPressure);
        const saveResult = await saveMeasurementForUser(userUid, {
          tinggi_badan: Number(height) || Number(profile.height) || 0,
          berat_badan: Number(weight) || Number(profile.weight) || 0,
          bmi:
            (Number(height) || Number(profile.height) || 0) > 0 && (Number(weight) || Number(profile.weight) || 0) > 0
              ? Number(
                  (
                    (Number(weight) || Number(profile.weight) || 0) /
                    Math.pow((Number(height) || Number(profile.height) || 0) / 100, 2)
                  ).toFixed(1)
                )
              : 0,
          detak_jantung: Number(heartRate) || 0,
          sistolik: bp.sistolik,
          diastolik: bp.diastolik,
          langkah_kaki: Number(totalActivitySteps) || 0,
          pola_makan: mealNote.trim() || "-",
          tanggal_pengukuran: new Date().toISOString(),
          sumber_data: "web_manual",
        });
        if (saveResult.ok) {
          setMeasurementHistoryDb((rows) => [{ id: saveResult.id, ...saveResult.payload }, ...rows]);
          const historyEntry = buildMeasurementHistoryEvent(saveResult.payload, {
            dataType: "Pengukuran",
            category: "Pengukuran",
            status: "Tersimpan",
            source: "measurement_manual_event",
            sourceLabel: "Web Manual",
          });
          if (historyEntry) {
            try {
              await appendHistoryEvents([historyEntry]);
            } catch {
              notify("Pengukuran tersimpan, tetapi event riwayat belum berhasil ditambahkan.");
            }
          }
        } else {
          notify(saveResult.message);
          return;
        }
      }

      notify("Pengukuran berhasil disimpan.");
    } catch (error) {
      console.error("saveManualMeasurement failed", error);
      notify("Simpan pengukuran gagal. Coba lagi beberapa saat.");
    }
  };

  const exportHistoryData = async (
    rowsOverride?: string[][],
    context?: {
      filterLabel?: string;
      rangeLabel?: string;
      modeLabel?: string;
    }
  ) => {
    const exportRows = rowsOverride && rowsOverride.length > 0 ? rowsOverride : historyDetailRows;
    if (exportRows.length === 0) {
      notify("Belum ada data riwayat untuk diekspor.");
      return;
    }

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const marginX = 12;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - marginX * 2;

    const columns = [
      { key: 0, label: "Tanggal", width: 28 },
      { key: 1, label: "Jenis", width: 23 },
      { key: 2, label: "Nilai", width: 24 },
      { key: 3, label: "Kategori", width: 18 },
      { key: 4, label: "Status", width: 18 },
      { key: 5, label: "Catatan", width: 75 },
    ];
    const profileRows = [
      ["Nama Lengkap", profile.fullName || "-"],
      ["Email", profile.email || userEmail || "-"],
      ["Nomor Telepon", profile.phone || "-"],
      ["Jenis Kelamin", profile.gender || "-"],
      ["Usia", profile.age ? `${profile.age} tahun` : "-"],
      ["Tanggal Lahir", profile.birthDate || "-"],
      ["Golongan Darah", profile.bloodType || "-"],
      ["Lokasi", profile.location || "-"],
      ["UID User", userUid || "-"],
    ];
    const educationSummary = deviceEducation.summary !== "-" ? deviceEducation.summary : hasAnyData ? "Kondisi kesehatan cukup stabil. Lanjutkan pola hidup sehat secara konsisten." : "-";
    const educationStatus = deviceEducation.status !== "-" ? deviceEducation.status : hasAnyData ? "Baik" : "-";
    const educationScore = deviceEducation.score > 0 ? `${deviceEducation.score}/100` : hasAnyData ? "86/100" : "-";
    const educationRecommendations = (
      deviceEducation.recommendations.length > 0
        ? deviceEducation.recommendations
        : hasAnyData
          ? ["Pertahankan aktivitas fisik teratur", "Cukupi asupan air harian", "Pantau tekanan darah rutin"]
          : ["Belum ada saran edukasi"]
    ).slice(0, 5);

    let y = 14;

    const drawTableHeader = () => {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.1);
      doc.rect(marginX, y, contentWidth, 7, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(6, 95, 70);

      let x = marginX;
      columns.forEach((column) => {
        doc.text(column.label, x + 1.5, y + 4.8);
        x += column.width;
      });
      y += 7;
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Riwayat Data Kesehatan", marginX, y);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Tanggal ekspor: ${formatLocalDateTime(new Date())}`, marginX, y);
    y += 5;
    doc.text(`Filter: ${context?.filterLabel || normalizedHistoryFilter}`, marginX, y);
    y += 7;
    if (context?.rangeLabel || context?.modeLabel) {
      const metaLabel = [context?.rangeLabel, context?.modeLabel].filter(Boolean).join(" • ");
      doc.text(`Mode: ${metaLabel}`, marginX, y);
      y += 6;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Data Diri", marginX, y);
    y += 2;

    const profileRowHeight = 5.4;
    const profileBoxHeight = profileRows.length * profileRowHeight + 5;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX, y, contentWidth, profileBoxHeight, "FD");
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.7);
    doc.setTextColor(30, 41, 59);
    profileRows.forEach(([label, value]) => {
      const text = `${label}: ${value}`;
      const lines = doc.splitTextToSize(text, contentWidth - 4);
      doc.text(lines, marginX + 2, y);
      y += Math.max(profileRowHeight, lines.length * 4);
    });
    y += 4;

    const eduLineTop = y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Saran Edukasi", marginX, y);
    y += 2;

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(240, 253, 244);
    const eduBoxStartY = y;
    const summaryLines = doc.splitTextToSize(`Ringkasan: ${educationSummary}`, contentWidth - 4);
    const recommendationLines = educationRecommendations.flatMap((item, index) => doc.splitTextToSize(`${index + 1}. ${item}`, contentWidth - 6));
    const eduBoxHeight = 17 + summaryLines.length * 4 + recommendationLines.length * 4;
    doc.rect(marginX, eduBoxStartY, contentWidth, eduBoxHeight, "FD");
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.7);
    doc.setTextColor(30, 41, 59);
    doc.text(`Status: ${educationStatus}`, marginX + 2, y);
    y += 4.5;
    doc.text(`Skor: ${educationScore}`, marginX + 2, y);
    y += 4.5;
    doc.text(summaryLines, marginX + 2, y);
    y += Math.max(4.5, summaryLines.length * 4) + 1;
    doc.text("Rekomendasi:", marginX + 2, y);
    y += 4;
    recommendationLines.forEach((line) => {
      doc.text(line, marginX + 4, y);
      y += 4;
    });
    y = Math.max(y, eduLineTop + eduBoxHeight + 8);

    drawTableHeader();

    exportRows.forEach((row) => {
      const wrappedByColumn = columns.map((column) => doc.splitTextToSize(String(row[column.key] ?? "-"), column.width - 3));
      const rowLineCount = Math.max(...wrappedByColumn.map((lines) => lines.length), 1);
      const rowHeight = Math.max(7, rowLineCount * 4.2);

      if (y + rowHeight > pageHeight - 12) {
        doc.addPage();
        y = 14;
        drawTableHeader();
      }

      let x = marginX;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.1);
      doc.rect(marginX, y, contentWidth, rowHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.7);
      doc.setTextColor(30, 41, 59);
      wrappedByColumn.forEach((lines, index) => {
        doc.text(lines, x + 1.5, y + 4.2);
        x += columns[index].width;
      });
      y += rowHeight;
    });

    const dateCode = new Date().toISOString().slice(0, 10);
    doc.save(`riwayat-sehatai-${dateCode}.pdf`);
    notify("Data riwayat berhasil diekspor ke PDF.");
  };

  const resetMeasurementHistory = async () => {
    if (!userUid || !storageReady) {
      notify("Login dan Firebase harus aktif sebelum reset data.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Hapus semua data pengukuran pada akun ini?\n\nData pengukuran di Firebase dan cache lokal akan dibersihkan."
      );
      if (!confirmed) return;
    }

    try {
      setHistoryResetting(true);
      await Promise.all([clearMeasurementHistoryForUser(userUid), clearMeasurementHistoryEventsForUser(userUid)]);

      setMeasurementHistoryDb([]);
      setHistoryEventDocs((rows) => rows.filter((row) => !MEASUREMENT_HISTORY_EVENT_TYPES.has(row.dataType)));
      setDeviceLatest(null);
      setManualSystolic("");
      setManualDiastolic("");
      setManualHeartRate("");
      setDeviceLastSeenAt("");
      setSyncTime("");
      setProfile((current) => ({ ...current, height: "", weight: "" }));
      setDraftProfile((current) => ({ ...current, height: "", weight: "" }));
      setDeviceEducation({
        score: 0,
        status: "-",
        summary: "-",
        recommendations: [],
      });
      setHistoryFilter("Semua");

      notify("Data pengukuran berhasil direset dari Firebase dan lokal.");
    } catch {
      notify("Reset data pengukuran gagal. Coba lagi sebentar.");
    } finally {
      setHistoryResetting(false);
    }
  };

  const addSmartReminder = (title: string) => {
    if (!addedRecommendations.includes(title)) setAddedRecommendations((items) => [...items, title]);
    notify(`Rekomendasi "${title}" ditambahkan.`);
  };

  const addReminder = async (reminder: typeof reminderDraft) => {
    if (!userUid || !storageReady) {
      notify("Login diperlukan untuk menyimpan pengingat.");
      return;
    }
    const title = reminder.title.trim() || "Pengingat Baru";
    const result = await createReminderForUser(userUid, {
      title,
      description: reminder.description,
      time: reminder.time,
      frequency: reminder.frequency,
      category: reminder.category,
      isEnabled: true,
    });
    if (!result.ok) {
      notify(result.message);
      return;
    }
    setReminderModal("");
    setReminderDraft({ title: "", description: "", time: "08:00", frequency: "Setiap hari", category: "Kesehatan" });
    notify(`Pengingat "${title}" ditambahkan.`);
  };

  const inferReminderCategory = (title: string): ReminderDoc["category"] => {
    if (title.toLowerCase().includes("obat")) return "Obat";
    if (title.toLowerCase().includes("air")) return "Minum";
    if (title.toLowerCase().includes("tidur")) return "Tidur";
    if (title.toLowerCase().includes("aktivitas")) return "Aktivitas";
    if (title.toLowerCase().includes("jalan")) return "Aktivitas";
    if (title.toLowerCase().includes("olahraga")) return "Aktivitas";
    if (title.toLowerCase().includes("cek")) return "Kesehatan";
    return "Lainnya";
  };

  const addRecommendedReminder = async (item: string[]) => {
    if (!userUid || !storageReady) {
      notify("Login diperlukan untuk menyimpan pengingat.");
      return;
    }
    const title = item[1];
    if (!activeReminders.some((reminder) => reminder.title === title)) {
      const result = await createReminderForUser(userUid, {
        title,
        description: item[2],
        time: "08:00",
        frequency: "Setiap hari",
        category: inferReminderCategory(title),
        isEnabled: true,
      });
      if (!result.ok) {
        notify(result.message);
        return;
      }
    }
    if (!addedRecommendations.includes(title)) setAddedRecommendations((items) => [...items, title]);
    setReminderModal("");
    notify(`Pengingat "${title}" ditambahkan.`);
  };

  const toggleReminderEnabled = async (item: ReminderListItem) => {
    if (!userUid || !storageReady) {
      notify("Login diperlukan untuk mengubah status pengingat.");
      return;
    }
    const nextEnabled = !(reminderEnabled[item.title] ?? item.isEnabled);
    setReminderEnabled((items) => ({ ...items, [item.title]: nextEnabled }));
    const result = await updateReminderForUser(userUid, item.id, {
      title: item.title,
      description: item.description,
      time: item.time,
      frequency: item.frequency,
      category: item.category,
      isEnabled: nextEnabled,
      createdAt: item.createdAt,
    });
    if (!result.ok) {
      setReminderEnabled((items) => ({ ...items, [item.title]: item.isEnabled }));
      notify(result.message);
      return;
    }
    notify(`Pengingat "${item.title}" ${nextEnabled ? "diaktifkan" : "dinonaktifkan"}.`);
  };

  const playAlarmPreview = (volume = alarmVolume, sound = alarmSound, force = false) => {
    const now = Date.now();
    if (!force && now - alarmPreviewAt.current < 180) return;
    alarmPreviewAt.current = now;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      notify("Browser belum mendukung preview suara.");
      return;
    }

    const audioContext = new AudioContextClass();
    const gain = audioContext.createGain();
    gain.gain.value = Math.max(0.02, volume / 100) * 0.22;
    gain.connect(audioContext.destination);

    const patterns: Record<string, { notes: number[]; step: number; sustain: number; type: OscillatorType }> = {
      "Nada Default": { notes: [660, 880, 660, 990, 660, 880], step: 0.2, sustain: 0.16, type: "sine" },
      "Lonceng Ringan": { notes: [784, 988, 1175, 988, 784], step: 0.23, sustain: 0.18, type: "triangle" },
      "Piano Lembut": { notes: [523, 659, 784, 659, 523], step: 0.24, sustain: 0.2, type: "sine" },
      "Digital Beep": { notes: [920, 920, 920, 920, 920, 920, 920], step: 0.15, sustain: 0.1, type: "square" },
    };
    const pattern = patterns[sound] ?? patterns["Nada Default"];

    pattern.notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = pattern.type;
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const start = audioContext.currentTime + index * pattern.step;
      oscillator.start(start);
      oscillator.stop(start + pattern.sustain);
    });

    const totalMs = Math.max(900, Math.ceil((pattern.notes.length * pattern.step + pattern.sustain + 0.1) * 1000));
    window.setTimeout(() => void audioContext.close(), totalMs);
  };

  const openEditReminder = (item: ReminderListItem) => {
    setEditingReminderId(item.id);
    setReminderDraft({
      title: item.title,
      description: item.description,
      time: item.time,
      frequency: item.frequency,
      category: item.category,
    });
    setReminderModal("edit");
  };

  const updateReminderTime = async () => {
    if (!userUid || !storageReady || !editingReminderId) {
      notify("Pengingat belum siap diperbarui.");
      return;
    }
    const currentReminder = reminderDocs.find((item) => item.id === editingReminderId);
    if (!currentReminder) {
      notify("Data pengingat tidak ditemukan.");
      return;
    }
    const nextTitle = reminderDraft.title.trim() || currentReminder.title;
    const result = await updateReminderForUser(userUid, editingReminderId, {
      title: nextTitle,
      description: reminderDraft.description.trim() || currentReminder.description,
      time: reminderDraft.time,
      frequency: reminderDraft.frequency,
      category: reminderDraft.category,
      isEnabled: reminderEnabled[currentReminder.title] ?? currentReminder.isEnabled,
      createdAt: currentReminder.createdAt,
    });
    if (!result.ok) {
      notify(result.message);
      return;
    }
    setReminderModal("");
    setEditingReminderId("");
    notify("Waktu pengingat berhasil diperbarui.");
  };

  const addMealEntry = async (foodOverride?: FoodOption) => {
    const food = foodOverride || FOOD_OPTIONS.find((item) => item.key === mealDraft.foodKey);
    if (!mealDraft.mealType.trim() || !mealDraft.time || !food) {
      notify("Pilih waktu makan, menu makanan, dan jam dengan benar.");
      return;
    }
    setMealHistoryEntries((entries) => [
      ...entries,
      {
        mealType: mealDraft.mealType.trim(),
        foodKey: food.key,
        foodName: food.name,
        time: mealDraft.time,
        calories: Math.round(food.calories),
        carbs: Number(food.carbs),
        protein: Number(food.protein),
        fat: Number(food.fat),
        fiber: Number(food.fiber),
        saturatedFat: Number(food.saturatedFat),
        unsaturatedFat: Number(food.unsaturatedFat),
      },
    ]);
    setMealDraft((current) => ({ ...current, foodKey: food.key }));
    setMealSavedAt(formatLocalDateTime(new Date()));
    await appendHistoryEvents([
      {
        occurredAt: new Date().toISOString(),
        dataType: "Pola Makan",
        value: `${Math.round(food.calories)} kkal`,
        category: "Nutrisi",
        status: "Tercatat",
        note: `${food.name} • ${mealDraft.mealType} • ${mealDraft.time}`,
        actionLabel: "Lihat",
        source: "meal",
      },
    ]);
    notify(`${food.name} berhasil ditambahkan ke pola makan hari ini.`);
  };

  const saveWaterTracking = async () => {
    if (waterGlasses <= 0) {
      notify("Tambahkan jumlah air minum terlebih dahulu.");
      return;
    }
    setMealSavedAt(formatLocalDateTime(new Date()));
    await appendHistoryEvents([
      {
        occurredAt: new Date().toISOString(),
        dataType: "Hidrasi",
        value: `${waterGlasses} gelas`,
        category: "Hidrasi",
        status: "Tercatat",
        note: "Asupan air harian",
        actionLabel: "Lihat",
        source: "hydration",
      },
    ]);
    notify("Asupan air berhasil diperbarui.");
    setMealPanel("");
  };

  const saveMealNote = async () => {
    if (!mealNote.trim()) {
      notify("Tulis catatan pola makan terlebih dahulu.");
      return;
    }
    setMealSavedAt(formatLocalDateTime(new Date()));
    await appendHistoryEvents([
      {
        occurredAt: new Date().toISOString(),
        dataType: "Pola Makan",
        value: mealNote.trim(),
        category: "Nutrisi",
        status: "Tercatat",
        note: "Catatan harian pola makan",
        actionLabel: "Lihat",
        source: "meal_note",
      },
    ]);
    notify("Catatan harian berhasil disimpan.");
    setMealPanel("");
  };

  return (
    <div className={`app-mobile ${resolvedTheme === "dark" ? "theme-dark" : "theme-light"} min-h-screen bg-[#F8FAF7] px-4 py-5 pb-24`}>
      <div className="luxury-shell mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:max-w-[1280px] md:grid md:grid-cols-[260px_minmax(0,1fr)] xl:max-w-[1360px]">
        <aside className="hidden bg-[linear-gradient(180deg,#064c3f_0%,#0b6c57_28%,#0b7f66_64%,#0d6f5c_100%)] text-white md:flex md:min-h-screen md:flex-col">
          <div className="border-b border-white/15 px-5 pb-5 pt-6">
            <div className="flex items-start gap-3">
              <img src="/assets/logo-web.png" alt="Logo Aplikasi" className="h-11 w-11 rounded-2xl border border-white/15 object-cover shadow-[0_18px_30px_-18px_rgba(0,0,0,0.5)]" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-100/90">Health Monitoring</p>
                <h1 className="mt-1 text-lg font-black leading-tight text-white">Sistem Monitoring Kesehatan</h1>
                <p className="mt-1 text-xs leading-5 text-emerald-50/85">Kontrol menu utama, data alat, dan akses cepat dalam satu panel.</p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{name}</p>
                  <p className="mt-1 text-xs text-emerald-100/85">{profileMetaLine}</p>
                </div>
                <span className="rounded-full border border-white/12 bg-white/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-50">
                  Aktif
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[#072f25]/25 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/75">Menu Aktif</p>
                  <p className="mt-2 text-sm font-black text-white">{activeMenu}</p>
                </div>
                <div className="rounded-2xl bg-[#072f25]/25 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/75">Perangkat</p>
                  <p className="mt-2 truncate text-sm font-black text-white">{deviceIdentity.deviceId}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-4">
            <div className="mb-3 px-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-100/70">Navigasi</p>
            </div>

            <nav className="space-y-2.5">
              {menuItems.map((item) => (
                <button
                  key={item.menu}
                  type="button"
                  onClick={() => setActiveMenu(item.menu)}
                  className={`group w-full rounded-[22px] border px-3.5 py-3 text-left transition-all duration-300 ease-out ${
                    activeMenu === item.menu
                      ? "border-[#f1d28a] bg-[linear-gradient(135deg,rgba(255,255,255,0.18)_0%,rgba(242,208,137,0.26)_100%)] shadow-[0_18px_30px_-20px_rgba(0,0,0,0.45)]"
                      : "border-white/8 bg-white/[0.05] hover:border-white/15 hover:bg-white/[0.11]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-base transition ${
                        activeMenu === item.menu
                          ? "bg-white text-[#0d6d56] shadow-[0_12px_24px_-16px_rgba(255,255,255,0.8)]"
                          : "bg-white/10 text-white/90 group-hover:bg-white/16"
                      }`}
                    >
                      <i className={`fa-solid ${item.icon}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-black ${activeMenu === item.menu ? "text-white" : "text-white/92"}`}>{item.label}</p>
                      <p className={`mt-1 text-xs leading-5 ${activeMenu === item.menu ? "text-emerald-50/90" : "text-emerald-100/72"}`}>{item.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-[24px] border border-white/12 bg-[#072f25]/28 p-4 text-emerald-50 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-100/70">Status Koneksi Alat</p>
                  <p className="mt-2 text-[18px] font-black leading-none">{deviceIdentity.deviceId}</p>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10">
                  <i className="fa-solid fa-wifi text-base text-white/90" />
                </div>
              </div>
              <p
                className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${
                  isDeviceOnline ? "bg-emerald-300/20 text-emerald-50" : isDeviceLinked ? "bg-amber-300/20 text-amber-50" : "bg-rose-300/20 text-rose-50"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isDeviceOnline ? "bg-emerald-300" : isDeviceLinked ? "bg-amber-300" : "bg-rose-300"}`} />
                {deviceStatus}
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 bg-[#F8FAF7] px-4 py-4 pb-24 md:bg-white md:p-5 md:pb-5">
          <div className="w-full max-w-md mx-auto space-y-4 md:max-w-none md:space-y-0">
            {activeMenu === "Edukasi" ? null : (
              <header className="mb-4 flex flex-col gap-3 border-b border-[#e8eef1] pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h2 className="menu-page-title text-xl font-bold text-slate-900 sm:text-2xl lg:text-[28px]">{activeMenu === "Aktivitas" ? "Aktivitas & Langkah" : activeMenu}</h2>
                  <p className="menu-page-subtitle text-xs text-slate-500 sm:text-sm">{activeMenu === "Aktivitas" ? "Pantau aktivitas harian dan capai target kesehatan Anda" : activeMenu === "Pengingat & Alarm" ? "Kelola pengingat kesehatan dan alarm Anda" : "Kelola kesehatan Anda dengan baik hari ini."}</p>
                </div>
                <div className="w-full space-y-2 sm:grid sm:gap-2 sm:space-y-0 sm:grid-cols-[1fr_auto_auto] sm:items-center lg:w-auto">
                  <div className="rounded-2xl border border-[#dfe6ea] bg-white px-3 py-2 text-sm">
                    <p className="font-black text-slate-900">{name}</p>
                    <p className="text-xs font-medium text-slate-500">{headerDateText}</p>
                    <p className="text-xs font-medium text-slate-500">{headerTimeText}</p>
                  </div>
                  <div className="grid grid-cols-[40px_1fr] gap-2 sm:contents">
                    <button
                      type="button"
                      onClick={() => {
                        if (isMobileViewport) {
                          setActiveSettingsPanel("Notifikasi");
                        } else {
                          setActiveMenu("Pengingat & Alarm");
                        }
                      }}
                      className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#dfe6ea] bg-white text-slate-700 hover:bg-slate-50 sm:h-11 sm:w-11"
                      aria-label="Notifikasi"
                      title="Notifikasi"
                    >
                      <i className="fa-solid fa-bell" />
                      {notificationCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{notificationCount}</span> : null}
                    </button>
                    <button type="button" onClick={onSignOut} className="h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 px-3 text-sm font-black text-white hover:brightness-105 sm:h-11 sm:px-4">
                      <i className="fa-solid fa-right-from-bracket mr-2" />
                      Keluar
                    </button>
                  </div>
                </div>
              </header>
            )}

            {toast ? (
              <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-2xl">
                {toast}
              </div>
            ) : null}

            {connectDeviceModalOpen ? (
              <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/35 p-4">
                <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#e4eaee] bg-white p-5 shadow-2xl">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">Connect Device ESP32-S3 UNO</h3>
                      <p className="text-sm text-slate-500">Tautkan device ke Firebase agar alat tetap bisa dipakai di web lokal maupun web publish tanpa tergantung IP.</p>
                    </div>
                    <button type="button" onClick={() => setConnectDeviceModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>

                  <div className="rounded-xl border border-[#e4eaee] bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-black text-slate-800">Cara kerja</p>
                    <p className="mt-1">Web menyimpan `deviceId` dan kunci alat unik ke Firebase. ESP32 memakai dua nilai itu untuk mengirim tinggi dan berat badan ke `device_stream`, lalu web otomatis memasukkan hasilnya ke riwayat user yang sedang login. Kunci ini dibuat khusus untuk device ini, jadi tidak dipakai bersama alat lain.</p>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                    <div className="rounded-2xl border border-[#dfe6ea] bg-white p-4">
                      <p className="text-sm font-black text-slate-900">Pengaturan Device</p>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                        <p><span className="font-black text-slate-800">Status:</span> {isDeviceOnline ? "Online" : deviceIdentity.connected ? "Tertaut, menunggu data alat" : "Belum ditautkan"}</p>
                        <p><span className="font-black text-slate-800">Device aktif:</span> {deviceIdentity.deviceId}</p>
                        <p><span className="font-black text-slate-800">User:</span> {name}</p>
                      </div>
                      {deviceConnectError ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{deviceConnectError}</p> : null}
                      <label className="mt-4 block text-sm font-bold text-slate-700">
                        Device ID
                        <input
                          value={deviceIdInput}
                          onChange={(event) => setDeviceIdInput(normalizeDeviceId(event.target.value))}
                          className="mt-1 w-full rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          placeholder="Contoh: ESP32-S3-UNO-01"
                        />
                      </label>
                      <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                        <p className="font-black">Kunci Alat</p>
                        <p className="mt-1 break-all">{deviceWriteKey || "Dibuat otomatis khusus untuk device ini."}</p>
                      </div>
                      <div className="mt-4">
                        <button type="button" onClick={() => void connectDeviceToFirebase(deviceIdInput)} disabled={deviceConnectSaving} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                          {deviceConnectSaving ? "Menyimpan..." : "Tautkan Device ke Firebase"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#dfe6ea] bg-slate-950 p-4 text-xs text-slate-100">
                      <p className="text-sm font-black text-white">Payload Untuk ESP32</p>
                      <pre className="mt-3 overflow-x-auto rounded-xl bg-black/35 p-3">{`POST /device_stream/${normalizeDeviceId(deviceIdInput || deviceIdentity.deviceId || DEFAULT_DEVICE_ID)}.json

{
  "deviceId": "${normalizeDeviceId(deviceIdInput || deviceIdentity.deviceId || DEFAULT_DEVICE_ID)}",
  "writeKey": "${deviceWriteKey || "KUNCI_ALAT_DARI_WEB"}",
  "height": 170,
  "weight": 65,
  "heartRate": 0,
  "steps": 0,
  "bloodPressure": "0/0",
  "createdAt": "${new Date().toISOString()}"
}`}</pre>
                      <p className="mt-3 text-slate-300">ESP32 hanya butuh internet. Web lokal atau publish akan membaca data yang sama dari Firebase.</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#dfe6ea] bg-white p-4">
                    <p className="text-sm font-black text-slate-900">Catatan Penting Untuk Sidang</p>
                    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      <p>1. Jangan pakai IP lokal ESP sebagai jalur utama.</p>
                      <p>2. Jalankan alat dan web pada internet yang aktif, bisa WiFi atau hotspot HP.</p>
                      <p>3. Karena alat kirim ke Firebase, web lokal dan web publish akan tetap membaca data yang sama.</p>
                      <p>4. Jika jaringan berpindah, cukup sambungkan ESP32 ke internet baru, tanpa perlu mengubah IP di web.</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button type="button" onClick={() => setConnectDeviceModalOpen(false)} className="w-full rounded-xl border border-[#dfe6ea] bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
                      Tutup
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {isEditingProfile ? (
              <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/35 p-4">
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const nextProfile = mergeEditableProfile(
                      {
                        ...draftProfile,
                        age: calculateAgeFromBirthDate(draftProfile.birthDate) || draftProfile.age,
                      },
                      profile
                    );
                    setProfile(nextProfile);
                    setDraftProfile(nextProfile);
                    writeLocalEditableProfile(profileStorageKey, nextProfile);

                    let firebaseSynced = false;
                    if (userUid && storageReady) {
                      const profileDoc = buildUserProfileDoc({
                        nama: nextProfile.fullName,
                        email: nextProfile.email,
                        username: nextProfile.username,
                        tanggal_lahir: nextProfile.birthDate,
                        jenis_kelamin: nextProfile.gender,
                        golongan_darah: nextProfile.bloodType,
                        no_telepon: nextProfile.phone,
                        lokasi: nextProfile.location,
                        tinggi_badan: Number(nextProfile.height) || 0,
                        berat_badan: Number(nextProfile.weight) || 0,
                      });
                      try {
                        await saveUserProfile(userUid, profileDoc);
                        firebaseSynced = true;
                      } catch {
                        firebaseSynced = false;
                      }
                    }
                    setIsEditingProfile(false);
                    notify(firebaseSynced || !userUid ? "Profil berhasil diperbarui." : "Profil tersimpan di perangkat ini. Sinkron Firebase belum berhasil.");
                  }}
                  className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#e4eaee] bg-white p-5 shadow-2xl"
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">Edit Profil</h3>
                      <p className="text-sm text-slate-500">Perbarui informasi akun dan data pribadi Anda.</p>
                    </div>
                    <button type="button" onClick={() => setIsEditingProfile(false)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ["Nama Lengkap", "fullName", "text"],
                      ["Username", "username", "text"],
                      ["Email", "email", "email"],
                      ["Nomor Telepon", "phone", "tel"],
                      ["Jenis Kelamin", "gender", "text"],
                      ["Usia", "age", "number"],
                      ["Tanggal Lahir", "birthDate", "date"],
                      ["Golongan Darah", "bloodType", "text"],
                      ["Lokasi", "location", "text"],
                      ["Tinggi Badan (cm)", "height", "number"],
                      ["Berat Badan (kg)", "weight", "number"],
                    ].map((field) => (
                      <label key={field[1]} className="text-sm font-bold text-slate-700">
                        {field[0]}
                        <input
                          type={field[2]}
                          value={draftProfile[field[1] as keyof typeof draftProfile]}
                          onChange={(event) =>
                            setDraftProfile((current) => ({
                              ...current,
                              [field[1]]: field[1] === "height" || field[1] === "weight" ? normalizeHealthNumberInput(event.target.value) : event.target.value,
                              ...(field[1] === "birthDate" ? { age: calculateAgeFromBirthDate(event.target.value) } : {}),
                            }))
                          }
                          inputMode={field[1] === "height" || field[1] === "weight" || field[1] === "age" ? "numeric" : undefined}
                          readOnly={field[1] === "age" || field[1] === "username"}
                          className="mt-1 w-full rounded-xl border border-[#dfe6ea] bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">Simpan Profil</button>
                    <button type="button" onClick={() => { setDraftProfile(profile); setIsEditingProfile(false); }} className="rounded-xl border border-[#dfe6ea] bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Batal</button>
                  </div>
                </form>
              </div>
            ) : null}

            {activeSettingsPanel ? (
              <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/35 p-4">
                <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e4eaee] bg-white p-5 shadow-2xl">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">{activeSettingsPanel}</h3>
                      <p className="text-sm text-slate-500">Kelola pengaturan ini sesuai kebutuhan Anda.</p>
                    </div>
                    <button type="button" onClick={() => { setActiveSettingsPanel(""); setActiveHelpArticle(""); }} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>

                  {activeSettingsPanel === "Tujuan & Target" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        ["Langkah Harian", "steps", "langkah"],
                        ["Kalori Harian", "calories", "kkal"],
                        ["Durasi Aktivitas", "duration", "menit"],
                        ["Minum Air", "water", "gelas/hari"],
                      ].map((field) => (
                        <label key={field[1]} className="text-sm font-bold text-slate-700">
                          {field[0]}
                          <div className="mt-1 flex rounded-xl border border-[#dfe6ea] focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
                            <input type="number" value={targetPrefs[field[1] as keyof typeof targetPrefs]} onChange={(event) => setTargetPrefs((current) => ({ ...current, [field[1]]: event.target.value }))} className="w-full rounded-l-xl px-3 py-2 text-sm outline-none" />
                            <span className="grid min-w-24 place-items-center rounded-r-xl bg-slate-50 px-3 text-xs font-bold text-slate-500">{field[2]}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {activeSettingsPanel === "Satuan Pengukuran" ? (
                    <div className="space-y-3">
                      {[
                        ["Berat", "weight", ["Kilogram (kg)", "Pound (lb)"]],
                        ["Tinggi", "height", ["Sentimeter (cm)", "Meter (m)"]],
                        ["Jarak", "distance", ["Kilometer (km)", "Meter (m)", "Mil (mi)"]],
                        ["Kalori", "calories", ["Kilokalori (kkal)", "Kalori (cal)"]],
                      ].map((group) => (
                        <div key={group[1] as string} className="rounded-xl border border-[#e4eaee] p-3">
                          <p className="mb-2 text-sm font-black text-slate-900">{group[0] as string}</p>
                          <div className="flex flex-wrap gap-2">
                            {(group[2] as string[]).map((option) => (
                              <button key={option} type="button" onClick={() => setUnitPrefs((current) => ({ ...current, [group[1] as string]: option }))} className={`rounded-full px-3 py-2 text-xs font-black ${unitPrefs[group[1] as keyof typeof unitPrefs] === option ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"}`}>{option}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {activeSettingsPanel === "Notifikasi" ? (
                    <div className="space-y-3">
                      {Object.keys(notificationSettings).map((item) => (
                        <div key={item} className="flex items-center justify-between rounded-xl border border-[#e4eaee] p-3">
                          <div>
                            <p className="font-black text-slate-900">{item}</p>
                            <p className="text-xs text-slate-500">{notificationSettings[item] ? "Aktif" : "Nonaktif"}</p>
                          </div>
                          <ReminderToggle checked={notificationSettings[item]} onToggle={() => setNotificationSettings((current) => ({ ...current, [item]: !current[item] }))} />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {activeSettingsPanel === "Privasi & Keamanan" ? (
                    <div className="space-y-3">
                      {[
                        ["Autentikasi Dua Faktor", "twoFactor"],
                        ["Berbagi Data Kesehatan", "dataSharing"],
                        ["Izin Akses Aplikasi", "accessPermission"],
                      ].map((item) => (
                        <div key={item[1]} className="flex items-center justify-between rounded-xl border border-[#e4eaee] p-3">
                          <p className="font-black text-slate-900">{item[0]}</p>
                          <ReminderToggle checked={privacyPrefs[item[1] as keyof typeof privacyPrefs]} onToggle={() => setPrivacyPrefs((current) => ({ ...current, [item[1]]: !current[item[1] as keyof typeof privacyPrefs] }))} />
                        </div>
                      ))}
                      <button type="button" onClick={() => notify("Tautan ubah kata sandi dikirim ke email.")} className="w-full rounded-xl border border-emerald-300 px-4 py-3 text-sm font-black text-emerald-700">Kirim Link Ubah Kata Sandi</button>
                    </div>
                  ) : null}

                  {activeSettingsPanel === "Bahasa" ? (
                    <div className="space-y-2">
                      {["Bahasa Indonesia", "English"].map((item) => (
                        <button key={item} type="button" onClick={() => setLanguage(item)} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-black ${language === item ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e4eaee] text-slate-700"}`}>
                          <span>{item}</span>
                          {language === item ? <i className="fa-solid fa-check" /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {activeSettingsPanel === "Tentang Aplikasi" ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-[#e4eaee] bg-slate-50 p-4">
                        <p className="text-lg font-black text-slate-900">Health Monitoring System</p>
                        <p className="mt-1 text-sm text-slate-500">Versi 1.0.0</p>
                      </div>
                      <div className="rounded-xl border border-[#e4eaee] p-4">
                        <p className="text-sm leading-6 text-slate-600">
                          Aplikasi ini membantu pemantauan kesehatan harian melalui data pengukuran, aktivitas, pola makan, pengingat, dan sinkronisasi perangkat.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {activeSettingsPanel === "Pusat Bantuan" ? (
                    activeHelpArticle && selectedHelpArticle ? (
                      <div>
                        <button type="button" onClick={() => setActiveHelpArticle("")} className="mb-4 inline-flex items-center gap-2 text-sm font-black text-emerald-700">
                          <i className="fa-solid fa-arrow-left" />
                          Kembali ke daftar bantuan
                        </button>
                        <article className="rounded-2xl border border-[#e4eaee] bg-slate-50 p-4">
                          <h4 className="text-xl font-black text-slate-900">{activeHelpArticle}</h4>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{selectedHelpArticle.summary}</p>
                          <div className="mt-4 space-y-3">
                            {selectedHelpArticle.steps.map((step, index) => (
                              <div key={step} className="grid grid-cols-[32px_1fr] gap-3 rounded-xl bg-white p-3">
                                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-sm font-black text-emerald-700">{index + 1}</span>
                                <p className="text-sm font-semibold leading-6 text-slate-700">{step}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 rounded-xl bg-emerald-50 p-3">
                            <p className="text-sm font-black text-emerald-800">Tips</p>
                            <div className="mt-2 space-y-2">
                              {selectedHelpArticle.tips.map((tip) => (
                                <p key={tip} className="text-sm leading-6 text-emerald-700">- {tip}</p>
                              ))}
                            </div>
                          </div>
                        </article>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {Object.keys(helpArticles).map((item) => (
                          <button key={item} type="button" onClick={() => setActiveHelpArticle(item)} className="flex w-full items-center justify-between rounded-xl border border-[#e4eaee] px-4 py-3 text-left text-sm font-black text-slate-800 hover:border-emerald-200 hover:bg-emerald-50">
                            <span>{item}</span><i className="fa-solid fa-chevron-right text-xs text-slate-500" />
                          </button>
                        ))}
                      </div>
                    )
                  ) : null}

                  {activeSettingsPanel === "Hubungi Kami" ? (
                    <div className="space-y-3">
                      <button type="button" onClick={() => { setActiveSettingsPanel("Pusat Bantuan"); setActiveHelpArticle(""); }} className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl border border-[#e4eaee] px-4 py-3 text-left hover:border-emerald-200 hover:bg-emerald-50">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><i className="fa-solid fa-life-ring" /></span>
                        <span>
                          <span className="block text-sm font-black text-slate-900">Pusat Bantuan</span>
                          <span className="mt-1 block text-xs font-medium text-slate-500">Lihat panduan penggunaan aplikasi dan alat.</span>
                        </span>
                        <i className="fa-solid fa-chevron-right text-xs text-slate-500" />
                      </button>

                      <a href={`mailto:${supportContact.email}?subject=Pengaduan%20Pemantauan%20Hidup%20Sehat&body=Halo%20Pemantauan%20Hidup%20Sehat%2C%20saya%20ingin%20menyampaikan%20pengaduan%3A%0A%0A`} className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl border border-[#e4eaee] px-4 py-3 text-left hover:border-emerald-200 hover:bg-emerald-50">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-600"><i className="fa-solid fa-envelope" /></span>
                        <span>
                          <span className="block text-sm font-black text-slate-900">Pengaduan via Email</span>
                          <span className="mt-1 block text-xs font-medium text-slate-500">{supportContact.email}</span>
                        </span>
                        <i className="fa-solid fa-arrow-up-right-from-square text-xs text-slate-500" />
                      </a>

                      <a href={`https://wa.me/${supportContact.whatsapp}?text=Halo%20Pemantauan%20Hidup%20Sehat%2C%20saya%20ingin%20bertanya%20atau%20menyampaikan%20pengaduan.`} target="_blank" rel="noreferrer" className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl border border-[#e4eaee] px-4 py-3 text-left hover:border-emerald-200 hover:bg-emerald-50">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-green-50 text-green-600"><i className="fa-brands fa-whatsapp" /></span>
                        <span>
                          <span className="block text-sm font-black text-slate-900">Chat WhatsApp</span>
                          <span className="mt-1 block text-xs font-medium text-slate-500">{supportContact.phone}</span>
                        </span>
                        <i className="fa-solid fa-arrow-up-right-from-square text-xs text-slate-500" />
                      </a>

                      <a href={`tel:${supportContact.phone}`} className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl border border-[#e4eaee] px-4 py-3 text-left hover:border-emerald-200 hover:bg-emerald-50">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-600"><i className="fa-solid fa-phone" /></span>
                        <span>
                          <span className="block text-sm font-black text-slate-900">Telepon Langsung</span>
                          <span className="mt-1 block text-xs font-medium text-slate-500">{supportContact.phone}</span>
                        </span>
                        <i className="fa-solid fa-phone-volume text-xs text-slate-500" />
                      </a>
                    </div>
                  ) : null}

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => { notify(`${activeSettingsPanel} disimpan.`); setActiveSettingsPanel(""); setActiveHelpArticle(""); }} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">Simpan</button>
                    <button type="button" onClick={() => { setActiveSettingsPanel(""); setActiveHelpArticle(""); }} className="rounded-xl border border-[#dfe6ea] bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Tutup</button>
                  </div>
                </div>
              </div>
            ) : null}

            {mealPanel ? (
              <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/35 p-4">
                <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e4eaee] bg-white p-5 shadow-2xl">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">{mealPanel}</h3>
                      <p className="text-sm text-slate-500">
                        {mealPanel === "Input Pola Makan"
                          ? "Pilih contoh makanan untuk membantu mengisi 6 parameter pola makan hari ini."
                          : mealPanel === "Asupan Air"
                            ? "Atur jumlah gelas air harian agar target hidrasi tetap tercapai."
                            : "Tulis catatan singkat pola makan Anda hari ini."}
                      </p>
                    </div>
                    <button type="button" onClick={() => setMealPanel("")} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>

                  {mealPanel === "Input Pola Makan" ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                        <p className="text-sm font-black text-emerald-800">Cara Mengisi Pola Makan</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {[
                            ["1", "Pilih waktu makan", "Tentukan apakah ini sarapan, makan siang, makan malam, atau camilan."],
                            ["2", "Klik varian makanan", "Klik makanan pada kategori yang sesuai agar nutrisi langsung masuk otomatis."],
                            ["3", "Cek ringkasan", "Setelah diklik, 6 parameter pola makan hari ini akan langsung diperbarui."],
                          ].map((step) => (
                            <div key={step[1]} className="rounded-xl bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                              <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-700">{step[0]}</div>
                              <p className="text-sm font-black text-slate-900">{step[1]}</p>
                              <p className="mt-1 text-xs leading-5 text-slate-600">{step[2]}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 rounded-2xl border border-[#e4eaee] bg-white p-4 sm:grid-cols-2">
                        <label className="text-sm font-bold text-slate-700">
                          Waktu Makan
                          <select value={mealDraft.mealType} onChange={(event) => setMealDraft((current) => ({ ...current, mealType: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                            {["Sarapan", "Makan Siang", "Makan Malam", "Camilan", "Tambahan"].map((option) => <option key={option}>{option}</option>)}
                          </select>
                          <span className="mt-1 block text-xs font-medium text-slate-500">{MEAL_TYPE_DESCRIPTIONS[mealDraft.mealType as "Sarapan" | "Makan Siang" | "Makan Malam" | "Camilan" | "Tambahan"]}</span>
                        </label>
                        <label className="text-sm font-bold text-slate-700">
                          Jam
                          <input type="time" value={mealDraft.time} onChange={(event) => setMealDraft((current) => ({ ...current, time: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                          <span className="mt-1 block text-xs font-medium text-slate-500">Masukkan jam makan untuk membantu kebiasaan makan teratur.</span>
                        </label>
                        <div className="sm:col-span-2">
                          <p className="text-sm font-bold text-slate-700">Klik Varian Makanan</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">Setiap makanan yang Anda klik akan langsung masuk ke ringkasan pola makan hari ini sesuai waktu makan dan jam yang dipilih.</p>
                          {recommendedFoodOptions.length > 0 ? (
                            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-black text-emerald-800">Varian yang Cocok untuk {mealDraft.mealType}</p>
                                  <p className="text-xs text-emerald-700">Pilihan ini diprioritaskan agar pengguna tidak bingung memilih menu yang sesuai.</p>
                                </div>
                                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm">Rekomendasi</span>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {recommendedFoodOptions.map((option) => (
                                  <button
                                    key={`recommended-${option.key}`}
                                    type="button"
                                    onClick={() => addMealEntry(option)}
                                    className="rounded-xl border border-emerald-200 bg-white px-3 py-3 text-left transition hover:bg-emerald-50"
                                  >
                                    <p className="text-sm font-black text-slate-900">{option.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">{option.calories} kkal • {option.carbs}g karbo • {option.protein}g protein</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 space-y-3">
                            {FOOD_GROUP_ORDER.map((group) => (
                              <div key={group} className="rounded-2xl border border-[#e4eaee] bg-slate-50 p-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-black text-slate-900">{group}</p>
                                    <p className="text-xs text-slate-500">{FOOD_GROUP_DESCRIPTIONS[group]}</p>
                                  </div>
                                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm">
                                    Klik untuk input
                                  </span>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {FOOD_OPTIONS.filter((option) => option.group === group).map((option) => (
                                    <button
                                      key={option.key}
                                      type="button"
                                      onClick={() => addMealEntry(option)}
                                      className={`rounded-xl border px-3 py-3 text-left transition ${mealDraft.foodKey === option.key
                                          ? "border-emerald-300 bg-emerald-50"
                                          : "border-[#dfe6ea] bg-white hover:border-emerald-200 hover:bg-emerald-50/60"
                                        }`}
                                    >
                                      <p className="text-sm font-black text-slate-900">{option.name}</p>
                                      <p className="mt-1 text-xs text-slate-500">{option.calories} kkal • {option.carbs}g karbo • {option.protein}g protein</p>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 rounded-2xl border border-[#e4eaee] bg-slate-50 p-4 lg:grid-cols-[1.1fr_1fr]">
                        <div className="rounded-2xl bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ringkasan Pilihan</p>
                          <p className="mt-2 text-lg font-black text-slate-900">{selectedFood.name}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">{selectedFood.group}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{mealDraft.mealType}</span>
                            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">{mealDraft.time}</span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">{FOOD_GROUP_DESCRIPTIONS[selectedFood.group]}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            ["Kalori", `${selectedFood.calories} kkal`, "fa-fire", "text-orange-600 bg-orange-50"],
                            ["Karbohidrat", `${selectedFood.carbs} g`, "fa-wheat-awn", "text-amber-700 bg-amber-50"],
                            ["Protein", `${selectedFood.protein} g`, "fa-drumstick-bite", "text-rose-700 bg-rose-50"],
                            ["Serat", `${selectedFood.fiber} g`, "fa-leaf", "text-emerald-700 bg-emerald-50"],
                            ["Lemak Jenuh", `${selectedFood.saturatedFat} g`, "fa-bacon", "text-red-700 bg-red-50"],
                            ["Lemak Tak Jenuh", `${selectedFood.unsaturatedFat} g`, "fa-seedling", "text-lime-700 bg-lime-50"],
                          ].map((item) => (
                            <div key={item[0]} className="rounded-xl bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                              <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${item[3]}`}>
                                <i className={`fa-solid ${item[2]}`} />
                              </div>
                              <p className="text-xs font-semibold text-slate-500">{item[0]}</p>
                              <p className="mt-1 text-base font-black text-slate-900">{item[1]}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-emerald-800">Contoh Hari Ini Makan Apa Saja</p>
                            <p className="mt-1 text-xs font-medium text-emerald-700">Gunakan tabel ini sebagai acuan cepat jika pengguna bingung memilih makanan yang paling mendekati.</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm">Contoh Referensi</span>
                        </div>
                        <div className="mt-3 overflow-x-auto">
                          <table className="min-w-full text-left text-xs text-slate-700">
                            <thead>
                              <tr className="border-b border-emerald-100 text-slate-500">
                                <th className="px-2 py-2 font-bold">Makanan</th>
                                <th className="px-2 py-2 font-bold">Kalori</th>
                                <th className="px-2 py-2 font-bold">Karbohidrat</th>
                                <th className="px-2 py-2 font-bold">Protein</th>
                                <th className="px-2 py-2 font-bold">Lemak</th>
                                <th className="px-2 py-2 font-bold">Serat</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                ["Nasi putih 100 gr", "130 kkal", "28 gr", "2,7 gr", "0,3 gr", "0,4 gr"],
                                ["Dada ayam 100 gr", "165 kkal", "0 gr", "31 gr", "3,6 gr", "0 gr"],
                                ["Pisang 100 gr", "89 kkal", "23 gr", "1,1 gr", "0,3 gr", "2,6 gr"],
                                ["Brokoli 100 gr", "34 kkal", "7 gr", "2,8 gr", "0,4 gr", "2,6 gr"],
                              ].map((row) => (
                                <tr key={row[0]} className="border-b border-emerald-100/80 last:border-b-0">
                                  {row.map((cell) => (
                                    <td key={`${row[0]}-${cell}`} className="px-2 py-2">{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#e4eaee] p-4">
                        <p className="mb-1 text-sm font-black text-slate-900">Total Asupan 6 Parameter Hari Ini</p>
                        <p className="mb-3 text-xs font-medium text-slate-500">Bagian ini menghitung jumlah keseluruhan yang dimakan dan diminum dalam satu hari.</p>
                        {mealHistoryToday.length > 0 ? (
                          <div className="space-y-2">
                            {mealHistoryToday.map((item, index) => (
                              <div key={`${item[0]}-${item[1]}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-[#e4eaee] px-3 py-2 text-sm">
                                <div>
                                  <p className="font-semibold text-slate-800">{item[0]}</p>
                                  <p className="text-slate-500">{item[1]}</p>
                                </div>
                                <span className="self-center font-black text-slate-900">{item[2]}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500">Belum ada riwayat makanan hari ini.</p>
                        )}
                        <p className="mt-3 text-right text-sm font-black text-emerald-700">Kalori saat ini: {mealCaloriesDisplay.toLocaleString("id-ID")} kkal</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => setMealPanel("")} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">Selesai</button>
                        <button type="button" onClick={() => { setMealHistoryEntries([]); notify("Riwayat makanan hari ini dibersihkan."); }} className="rounded-xl border border-[#dfe6ea] bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Reset Riwayat</button>
                      </div>
                    </div>
                  ) : null}

                  {mealPanel === "Asupan Air" ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-[#e4eaee] p-4">
                        <p className="text-sm font-semibold text-slate-500">Progress Hidrasi</p>
                        <p className="mt-2 text-3xl font-black text-slate-900">{waterGlasses} / 8 <span className="text-base font-semibold text-slate-500">gelas</span></p>
                        <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.round((waterGlasses / 8) * 100))}%` }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 items-center gap-3">
                        <button type="button" onClick={() => setWaterGlasses((count) => Math.max(0, count - 1))} className="rounded-xl border border-[#dfe6ea] bg-white px-4 py-3 text-xl font-black text-slate-700 hover:bg-slate-50">-</button>
                        <div className="rounded-xl border border-[#e4eaee] bg-slate-50 px-4 py-3 text-center text-lg font-black text-slate-900">{waterGlasses} gelas</div>
                        <button type="button" onClick={() => setWaterGlasses((count) => Math.min(20, count + 1))} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xl font-black text-emerald-700 hover:bg-emerald-100">+</button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={saveWaterTracking} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">Simpan Asupan Air</button>
                        <button type="button" onClick={() => { setWaterGlasses(0); notify("Asupan air direset."); }} className="rounded-xl border border-[#dfe6ea] bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Reset</button>
                      </div>
                    </div>
                  ) : null}

                  {mealPanel === "Catatan Harian" ? (
                    <div className="space-y-4">
                      <label className="block text-sm font-bold text-slate-700">
                        Catatan Hari Ini
                        <textarea className="mt-1 min-h-36 w-full resize-none rounded-xl border border-[#dfe6ea] px-3 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" maxLength={300} placeholder="Contoh: Hari ini makan lebih teratur, tapi masih kurang minum air." value={mealNote} onChange={(event) => setMealNote(event.target.value)} />
                      </label>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span>{mealSavedAt ? `Terakhir disimpan: ${mealSavedAt}` : "Belum pernah disimpan."}</span>
                        <span>{mealNote.length}/300</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={saveMealNote} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">Simpan Catatan</button>
                        <button type="button" onClick={() => setMealNote("")} className="rounded-xl border border-[#dfe6ea] bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Bersihkan</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {reminderModal ? (
              <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/35 p-4">
                <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e4eaee] bg-white p-5 shadow-2xl">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">{reminderModal === "add" ? "Tambah Pengingat" : reminderModal === "edit" ? "Edit Waktu Pengingat" : "Gunakan Rekomendasi"}</h3>
                      <p className="text-sm text-slate-500">{reminderModal === "add" ? "Buat pengingat kesehatan baru sesuai kebutuhan Anda." : reminderModal === "edit" ? "Ubah jam dan frekuensi pengingat yang sudah dibuat." : "Pilih rekomendasi cepat untuk dijadikan pengingat aktif."}</p>
                    </div>
                    <button type="button" onClick={() => setReminderModal("")} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>

                  {reminderModal === "add" || reminderModal === "edit" ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (reminderModal === "edit") void updateReminderTime();
                        else void addReminder(reminderDraft);
                      }}
                      className="space-y-4"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-bold text-slate-700">
                          Nama Pengingat
                          <input value={reminderDraft.title} onChange={(event) => setReminderDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Contoh: Minum Air Putih" className="mt-1 w-full rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                        </label>
                        <label className="text-sm font-bold text-slate-700">
                          Jam
                          <input type="time" value={reminderDraft.time} onChange={(event) => setReminderDraft((current) => ({ ...current, time: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                        </label>
                        <label className="text-sm font-bold text-slate-700">
                          Kategori
                          <select disabled={reminderModal === "edit"} value={reminderDraft.category} onChange={(event) => setReminderDraft((current) => ({ ...current, category: event.target.value as ReminderDoc["category"] }))} className="mt-1 w-full rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400">
                            {Object.keys(reminderStyleByCategory).map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </label>
                        <label className="text-sm font-bold text-slate-700">
                          Frekuensi
                          <select value={reminderDraft.frequency} onChange={(event) => setReminderDraft((current) => ({ ...current, frequency: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                            {["Setiap hari", "Hari kerja", "Akhir pekan", "Sekali saja"].map((frequency) => <option key={frequency}>{frequency}</option>)}
                          </select>
                        </label>
                      </div>
                      <label className="block text-sm font-bold text-slate-700">
                        Deskripsi
                        <textarea value={reminderDraft.description} onChange={(event) => setReminderDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Contoh: Minum 1 gelas air" className="mt-1 min-h-24 w-full resize-none rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">{reminderModal === "edit" ? "Simpan Perubahan" : "Simpan Pengingat"}</button>
                        <button type="button" onClick={() => setReminderModal("")} className="rounded-xl border border-[#dfe6ea] bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Batal</button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      {(smartReminderRows.length > 0 ? smartReminderRows : [
                        ["fa-droplet", "Minum Air Putih", "Minum air secara berkala agar tubuh tetap terhidrasi", "blue"],
                        ["fa-person-walking", "Olahraga Ringan", "Lakukan aktivitas ringan minimal 30 menit", "emerald"],
                        ["fa-heart-pulse", "Cek Kesehatan", "Pantau tekanan darah dan detak jantung", "rose"],
                        ["fa-moon", "Tidur Lebih Awal", "Istirahat lebih teratur setiap malam", "indigo"],
                      ]).map((item) => (
                        <button key={item[1]} type="button" onClick={() => void addRecommendedReminder(item)} className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl border border-[#e4eaee] px-4 py-3 text-left hover:border-emerald-200 hover:bg-emerald-50">
                          <ReminderIcon icon={item[0]} color={item[3]} />
                          <span>
                            <span className="block text-sm font-black text-slate-900">{item[1]}</span>
                            <span className="mt-1 block text-xs font-medium text-slate-500">{item[2]}</span>
                          </span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Pakai</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {alarmPanel ? (
              <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/35 p-4">
                <div className="w-full max-w-md rounded-2xl border border-[#e4eaee] bg-white p-5 shadow-2xl">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">{alarmPanel === "sound" ? "Pilih Suara Alarm" : "Atur Snooze"}</h3>
                      <p className="text-sm text-slate-500">{alarmPanel === "sound" ? "Pilih nada yang dipakai untuk alarm pengingat." : "Pilih jeda pengingat ulang setelah alarm berbunyi."}</p>
                    </div>
                    <button type="button" onClick={() => setAlarmPanel("")} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(alarmPanel === "sound" ? ["Nada Default", "Lonceng Ringan", "Piano Lembut", "Digital Beep"] : ["3 Menit", "5 Menit", "10 Menit", "15 Menit"]).map((option) => {
                      const active = alarmPanel === "sound" ? alarmSound === option : alarmSnooze === option;
                      return (
                        <button key={option} type="button" onClick={() => { if (alarmPanel === "sound") { setAlarmSound(option); playAlarmPreview(alarmVolume, option, true); } else setAlarmSnooze(option); setAlarmPanel(""); notify(`${alarmPanel === "sound" ? "Suara alarm" : "Snooze"} disetel: ${option}.`); }} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-black ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e4eaee] text-slate-700"}`}>
                          <span>{option}</span>
                          {active ? <i className="fa-solid fa-check" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="menu-transition-gold menu-ui-unified">
              {activeMenu === "Pengukuran Manual" ? (
                <section className="rounded-[30px] border border-[#e4ece8] bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfb_100%)] p-4 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.2)] sm:p-5 lg:p-6">
                  <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Manual Entry
                      </span>
                      <h3 className="mt-3 text-[28px] font-black leading-tight text-slate-900 sm:text-[34px]">Pengukuran Manual</h3>
                      <p className="mt-2 text-[15px] leading-7 text-slate-500">
                        Catat tekanan darah, detak jantung, dan catatan pengukuran dengan tampilan yang lebih rapi dan nyaman dibaca.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeviceConnectError("");
                        void connectDeviceToFirebase(DEFAULT_DEVICE_ID);
                      }}
                      disabled={deviceConnectSaving}
                      className="w-full rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] font-black text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 sm:w-auto"
                    >
                      {deviceConnectSaving ? "Menghubungkan..." : "Hubungkan Alat"}
                    </button>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-lg font-black text-slate-900 sm:text-[22px]">Input Pengukuran</h4>
                    <p className="mt-1 text-sm leading-6 text-slate-500">Lihat data terakhir dan isi parameter yang perlu dicatat secara manual.</p>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
                    <div className="grid gap-3 md:grid-cols-2">
                      <article className="rounded-[24px] border border-[#e7edf0] bg-[linear-gradient(180deg,#fffdfd_0%,#ffffff_100%)] p-4 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.3)]">
                        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                          <i className="fa-solid fa-heart-pulse" />
                        </div>
                        <p className="text-[15px] font-black text-slate-900">Tekanan Darah</p>
                        <div className="mt-3 space-y-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Sistolik</p>
                            <p className="mt-1 text-[30px] font-black leading-none text-slate-900 sm:text-[38px]">{hasBloodPressure ? bloodPressure.split("/")[0] : "-"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Diastolik</p>
                            <p className="mt-1 text-[30px] font-black leading-none text-slate-900 sm:text-[38px]">{hasBloodPressure ? bloodPressure.split("/")[1] : "-"}</p>
                          </div>
                          <p className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{hasBloodPressure ? bpStatus : "-"}</p>
                        </div>
                      </article>

                      <article className="rounded-[24px] border border-[#e7edf0] bg-white p-4 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.3)]">
                        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                          <i className="fa-solid fa-heart-circle-check" />
                        </div>
                        <p className="text-[15px] font-black text-slate-900">Detak Jantung</p>
                        {manualValue(hasHeartRate ? heartRate : "-", "bpm")}
                      </article>

                      <article className="rounded-[24px] border border-[#e7edf0] bg-white p-4 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.3)]">
                        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                          <i className="fa-solid fa-weight-scale" />
                        </div>
                        <p className="text-[15px] font-black text-slate-900">Berat Badan</p>
                        {manualValue(hasWeight ? weight : "-", "kg")}
                      </article>

                      <article className="rounded-[24px] border border-[#e7edf0] bg-white p-4 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.3)]">
                        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                          <i className="fa-solid fa-ruler-vertical" />
                        </div>
                        <p className="text-[15px] font-black text-slate-900">Tinggi Badan</p>
                        {manualValue(hasHeight ? height : "-", "cm")}
                      </article>
                    </div>

                    <article className="rounded-[24px] border border-[#e7edf0] bg-white p-4 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.3)] sm:p-5">
                      <p className="text-lg font-black text-slate-900">Form Pengukuran</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Masukkan hasil ukur terbaru, lalu simpan agar riwayat dan edukasi ikut diperbarui.</p>

                      <div className="mt-4 space-y-3.5">
                        <div className="rounded-2xl bg-slate-50 p-3.5">
                          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Input Tekanan Darah</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1.5 block text-[13px] font-bold text-slate-600">Sistolik</span>
                              <input
                                className="w-full rounded-2xl border border-[#dfe6ea] bg-white px-4 py-3 text-[15px] font-semibold text-slate-900 outline-none transition focus:border-emerald-400"
                                inputMode="numeric"
                                placeholder="120"
                                value={manualSystolic}
                                onChange={(event) => setManualSystolic(normalizeHealthNumberInput(event.target.value))}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1.5 block text-[13px] font-bold text-slate-600">Diastolik</span>
                              <input
                                className="w-full rounded-2xl border border-[#dfe6ea] bg-white px-4 py-3 text-[15px] font-semibold text-slate-900 outline-none transition focus:border-emerald-400"
                                inputMode="numeric"
                                placeholder="80"
                                value={manualDiastolic}
                                onChange={(event) => setManualDiastolic(normalizeHealthNumberInput(event.target.value))}
                              />
                            </label>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-orange-50/80 p-3.5">
                          <label className="block">
                            <span className="mb-1.5 block text-[13px] font-bold text-orange-700">Input Detak Jantung (bpm)</span>
                            <input
                              className="w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-[15px] font-semibold text-slate-900 outline-none transition focus:border-orange-300"
                              inputMode="numeric"
                              placeholder="Contoh: 78"
                              value={manualHeartRate}
                              onChange={(event) => setManualHeartRate(normalizeHealthNumberInput(event.target.value))}
                            />
                          </label>
                        </div>

                        <div>
                          <p className="mb-1.5 text-[13px] font-bold text-slate-600">Waktu Pengukuran</p>
                          <input className="w-full rounded-2xl border border-[#dfe6ea] bg-white px-4 py-3 text-[14px] font-medium text-slate-700" value={syncTime} readOnly />
                        </div>

                        <div>
                          <p className="mb-1.5 text-[13px] font-bold text-slate-600">Kategori Kondisi</p>
                          <input className="w-full rounded-2xl border border-[#dfe6ea] bg-white px-4 py-3 text-[14px] font-medium text-slate-700" value="Sebelum Makan" readOnly />
                        </div>

                        <div>
                          <p className="mb-1.5 text-[13px] font-bold text-slate-600">Perangkat & User Tersinkron</p>
                          <input className="w-full rounded-2xl border border-[#dfe6ea] bg-white px-4 py-3 text-[14px] font-medium text-slate-700" value={isDeviceConnected ? `${deviceIdentity.deviceId} • ${deviceIdentity.userName}` : "Belum terhubung"} readOnly />
                        </div>

                        <div>
                          <p className="mb-1.5 text-[13px] font-bold text-slate-600">Hasil Edukasi Terbaru</p>
                          <textarea className="min-h-24 w-full resize-none rounded-2xl border border-[#dfe6ea] bg-white px-4 py-3 text-[14px] leading-6 text-slate-700" value={deviceEducation.summary !== "-" ? deviceEducation.summary : "Belum ada hasil edukasi dari alat"} readOnly />
                        </div>

                        <div>
                          <p className="mb-1.5 text-[13px] font-bold text-slate-600">Catatan (opsional)</p>
                          <textarea
                            className="min-h-28 w-full resize-none rounded-2xl border border-[#dfe6ea] px-4 py-3 text-[14px] leading-6 text-slate-700 outline-none transition focus:border-emerald-400"
                            maxLength={200}
                            placeholder="Tambahkan catatan pengukuran..."
                            value={manualNote}
                            onChange={(event) => setManualNote(event.target.value)}
                          />
                          <p className="mt-1.5 text-right text-[12px] font-medium text-slate-500">{manualNote.length}/200</p>
                        </div>

                        {manualSavedAt ? <p className="rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-[12px] font-bold text-emerald-700">Terakhir disimpan: {manualSavedAt}</p> : null}
                      </div>
                    </article>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={saveManualMeasurement} className="rounded-2xl bg-[linear-gradient(135deg,#0f6d55_0%,#1b8b67_55%,#36b189_130%)] px-5 py-3.5 text-[14px] font-black text-white shadow-[0_18px_35px_-20px_rgba(16,109,85,0.48)] transition hover:brightness-105">Simpan Pengukuran</button>
                    <button type="button" onClick={() => { setManualSystolic(""); setManualDiastolic(""); setManualHeartRate(""); setManualNote(""); notify("Form pengukuran dibersihkan."); }} className="rounded-2xl border border-[#dfe6ea] bg-white px-5 py-3.5 text-[14px] font-black text-slate-700 transition hover:bg-slate-50">Bersihkan</button>
                  </div>

                </section>
              ) : activeMenu === "Dashboard" ? (
                <Suspense fallback={LAZY_PAGE_FALLBACK}>
                  <DashboardPage
                    embedded
                    bmi={dashboardBmi}
                    bloodPressure={bloodPressure}
                    heartRate={heartRate}
                    steps={totalActivitySteps}
                    mealCalories={mealCaloriesDisplay}
                    mealCarbs={carbsDisplay}
                    mealProtein={proteinDisplay}
                    mealFat={fatDisplay}
                    mealFiber={fiberDisplay}
                    waterGlasses={waterDisplay}
                    activityRows={activityRowsLive}
                  />
                </Suspense>
              ) : null}

              {activeMenu === "Aktivitas" ? (
                <>
                  <section className="mt-4 overflow-hidden rounded-[28px] border border-[#d9e9e2] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_34%),linear-gradient(135deg,#f7fffb_0%,#effaf5_36%,#ffffff_100%)] p-4 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.32)] sm:p-5">
                    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Activity Live Control
                        </div>
                        <h3 className="mt-3 text-xl font-black text-slate-900 sm:text-[28px]">Pantau gerak harian dengan panel yang lebih jelas</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                          {isActivityRunning
                            ? "Aktivitas sedang berjalan. Sistem memperbarui langkah, jarak, durasi, dan estimasi kalori secara otomatis."
                            : "Pilih mode aktivitas, mulai sesi, lalu biarkan sistem membaca gerakan dan merangkum performa Anda."}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2.5">
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#d5e6df] bg-white/90 px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm">
                            <span className={`h-2.5 w-2.5 rounded-full ${gpsStatus === "tracking" ? "bg-emerald-500" : gpsStatus === "idle" ? "bg-slate-400" : "bg-amber-500"}`} />
                            {gpsStatusLabel}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#d5e6df] bg-white/90 px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm">
                            <i className="fa-solid fa-person-walking text-emerald-600" />
                            {isActivityRunning ? gpsDetectedMotion : currentActivityType}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#d5e6df] bg-white/90 px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm">
                            <i className="fa-solid fa-stopwatch text-sky-600" />
                            {isActivityRunning ? formatDuration(activitySession.durationSec) : "Belum berjalan"}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#d5e6df] bg-white/90 px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm">
                            <i className="fa-solid fa-mobile-screen-button text-violet-600" />
                            {motionPermissionState === "granted"
                              ? "Sensor HP Aktif"
                              : motionPermissionState === "requesting"
                                ? "Minta izin sensor"
                                : motionPermissionState === "denied"
                                  ? "Sensor ditolak"
                                  : motionPermissionState === "unavailable"
                                    ? "Sensor tidak didukung"
                                    : "Sensor siap"}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#d5e6df] bg-white/90 px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm">
                            <i className="fa-solid fa-sliders text-emerald-600" />
                            {motionStepCount > 0
                              ? `${motionStepCount.toLocaleString("id-ID")} langkah sensor`
                              : `Kalibrasi ${activityCalibration.strideMultiplier[currentActivityType].toFixed(2)}x`}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {activityOverviewCards.map((item) => (
                            <article key={item.label} className="rounded-[22px] border border-white/80 bg-white/88 px-4 py-3.5 shadow-[0_18px_35px_-28px_rgba(15,23,42,0.35)] backdrop-blur">
                              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                              <p className="mt-2 text-lg font-black leading-tight text-slate-900">{item.value}</p>
                              <p className="mt-2 text-xs leading-5 text-slate-500">{item.note}</p>
                            </article>
                          ))}
                        </div>

                        {isActivityRunning ? (
                          <div className="mt-4 rounded-[22px] border border-emerald-100 bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <span className="font-semibold text-slate-900">Koordinat terakhir: {gpsLastPointLabel}</span>
                              <span>Kecepatan live: {gpsSpeedMps.toFixed(2)} m/detik</span>
                              <span>Deteksi aktivitas: {gpsDetectedMotion}</span>
                            </div>
                          </div>
                        ) : null}
                        {gpsErrorMessage ? <p className="mt-3 text-sm font-semibold text-amber-700">{gpsErrorMessage}</p> : null}
                      </div>

                      <div className="rounded-[26px] border border-[#dbe9e4] bg-white/92 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.3)] sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Mode Aktivitas</p>
                            <p className="mt-1 text-lg font-black text-slate-900">Pilih fokus sesi Anda</p>
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
                            {currentActivityType}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2.5 sm:grid-cols-3 xl:grid-cols-1">
                          {(["Jalan", "Lari", "Sepeda"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              disabled={isActivityRunning}
                              onClick={() => setActivityType(type)}
                              className={`flex items-center justify-between rounded-[20px] border px-4 py-3 text-left transition ${currentActivityType === type ? "border-emerald-500 bg-emerald-600 text-white shadow-[0_16px_30px_-22px_rgba(5,150,105,0.65)]" : "border-[#dfe6ea] bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/70"} ${isActivityRunning ? "cursor-not-allowed opacity-70" : ""}`}
                            >
                              <span className="flex items-center gap-3">
                                <span className={`grid h-10 w-10 place-items-center rounded-2xl ${currentActivityType === type ? "bg-white/18 text-white" : "bg-emerald-50 text-emerald-700"}`}>
                                  <i className={`fa-solid ${activityPresets[type].icon}`} />
                                </span>
                                <span>
                                  <span className="block text-sm font-black">{type}</span>
                                  <span className={`block text-xs ${currentActivityType === type ? "text-white/80" : "text-slate-500"}`}>
                                    {type === "Jalan" ? "Sesi santai dan stabil" : type === "Lari" ? "Fokus ritme dan intensitas" : "Fokus jarak dan kecepatan"}
                                  </span>
                                </span>
                              </span>
                              <i className={`fa-solid ${currentActivityType === type ? "fa-circle-check" : "fa-chevron-right"} text-xs`} />
                            </button>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
                          <button
                            type="button"
                            onClick={startActivitySession}
                            disabled={isActivityRunning}
                            className={`rounded-2xl px-4 py-3 text-sm font-black transition ${isActivityRunning ? "cursor-not-allowed bg-slate-100 text-slate-400" : "bg-[linear-gradient(135deg,#0f6d55_0%,#1b8b67_55%,#36b189_130%)] text-white shadow-[0_18px_35px_-22px_rgba(16,109,85,0.52)] hover:brightness-105"}`}
                          >
                            Mulai Aktivitas
                          </button>
                          <button
                            type="button"
                            onClick={stopActivitySession}
                            disabled={!isActivityRunning}
                            className={`rounded-2xl px-4 py-3 text-sm font-black transition ${!isActivityRunning ? "cursor-not-allowed bg-slate-100 text-slate-400" : "bg-rose-600 text-white shadow-[0_18px_35px_-24px_rgba(225,29,72,0.45)] hover:bg-rose-700"}`}
                          >
                            Berhenti
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                    <Card icon="fa-shoe-prints" color="emerald" title="Langkah Hari Ini" value={totalActivitySteps > 0 ? totalActivitySteps.toLocaleString("id-ID") : "-"} unit="langkah" note={totalActivitySteps > 0 ? `${activityPercent}% dari target 10.000 langkah` : "-"} />
                    <Card icon="fa-ruler-horizontal" color="sky" title="Jarak" value={activityDistance} unit="km" note={totalActivitySteps > 0 ? `Mode: ${currentMotionLabel}` : "-"} />
                    <Card icon="fa-fire" color="orange" title="Kalori Terbakar" value={activityCalories} unit="kkal" note={totalActivitySteps > 0 ? `Estimasi kalori ${currentMotionLabel.toLowerCase()}` : "-"} />
                    <Card icon="fa-stopwatch" color="indigo" title="Durasi Aktivitas" value={activityDuration} unit="durasi" note={totalActivitySteps > 0 ? "Durasi sesi aktivitas aktif" : "-"} />
                  </section>

                  <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_.85fr]">
                    <article className="rounded-[26px] border border-[#e4eaee] bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.22)] sm:p-5">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Tren Mingguan</p>
                          <h4 className="mt-1 text-lg font-black text-slate-900 sm:text-xl">Grafik {isMobileViewport ? activityTrendMetric : "Langkah"} 7 Hari Terakhir</h4>
                        </div>
                        <button type="button" onClick={() => { if (isMobileViewport) { setActivityTrendMetric((current) => (current === "Langkah" ? "Jarak" : current === "Jarak" ? "Kalori" : "Langkah")); return; } notify("Grafik sedang menampilkan data langkah."); }} className="w-full rounded-2xl border border-[#dfe6ea] bg-slate-50 px-3.5 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 sm:w-auto">{isMobileViewport ? activityTrendMetric : "Langkah"}</button>
                      </div>
                      <div className="flex h-44 items-end gap-2 sm:h-52 sm:gap-3">
                        {trendSeries.map((value, idx) => (
                          <div key={idx} className="flex flex-1 flex-col items-center gap-1">
                            <span className="text-[10px] font-semibold text-slate-500">{value > 0 ? value.toLocaleString("id-ID") : "-"}</span>
                            <div className="w-full rounded-md bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${value > 0 ? Math.max(18, (value / trendMax) * 130) : 8}px`, opacity: value > 0 ? 1 : 0.2 }} />
                            <span className="text-[10px] text-slate-500">{weekLabels[idx]}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Total Mingguan</p>
                          <p className="mt-2 text-lg font-black text-slate-900">{hasTrackedActivity ? weeklyActivityTotal.toLocaleString("id-ID") : "-"}</p>
                          <p className="mt-1 text-xs text-slate-500">langkah 7 hari terakhir</p>
                        </div>
                        <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Jarak Mingguan</p>
                          <p className="mt-2 text-lg font-black text-slate-900">{hasTrackedActivity ? `${weeklyDistanceTotal.toFixed(1)} km` : "-"}</p>
                          <p className="mt-1 text-xs text-slate-500">akumulasi estimasi gerak</p>
                        </div>
                        <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Kalori Mingguan</p>
                          <p className="mt-2 text-lg font-black text-slate-900">{hasTrackedActivity ? `${weeklyCaloriesTotal.toLocaleString("id-ID")} kkal` : "-"}</p>
                          <p className="mt-1 text-xs text-slate-500">estimasi pembakaran energi</p>
                        </div>
                      </div>
                    </article>
                    <article className="rounded-[26px] border border-[#e4eaee] bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.22)] sm:p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Target Harian</p>
                      <h4 className="mt-1 text-lg font-black text-slate-900 sm:text-xl">Fokus 10.000 langkah</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {hasTrackedActivity
                          ? totalActivitySteps >= 10000
                            ? "Target hari ini sudah tercapai. Pertahankan ritme dan jaga pemulihan."
                            : `${activityGoalRemaining.toLocaleString("id-ID")} langkah lagi untuk menutup target harian.`
                          : "Belum ada sesi tercatat hari ini. Mulai dari langkah ringan agar target mulai bergerak."}
                      </p>
                      <div className="mx-auto mt-5 grid h-28 w-28 place-items-center rounded-full border-[12px] border-emerald-500/85 text-center text-2xl font-black text-slate-900 sm:h-32 sm:w-32 sm:text-[28px]">
                        {totalActivitySteps > 0 ? `${activityPercent}%` : "-"}
                      </div>
                      <div className="mt-5 grid gap-3">
                        <div className="rounded-[20px] bg-emerald-50 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700/80">Hari Aktif</p>
                          <p className="mt-2 text-lg font-black text-emerald-900">{hasTrackedActivity ? `${weeklyActiveDays}/7 hari` : "-"}</p>
                        </div>
                        <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Streak Saat Ini</p>
                          <p className="mt-2 text-lg font-black text-slate-900">{hasTrackedActivity && weeklyActivityStreak > 0 ? `${weeklyActivityStreak} hari` : "-"}</p>
                        </div>
                      </div>
                    </article>
                  </section>

                  <section className="mt-4 rounded-[26px] border border-[#e4eaee] bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.22)] sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Riwayat Terakhir</p>
                        <h4 className="mt-1 text-lg font-black text-slate-900">Sesi aktivitas terbaru</h4>
                      </div>
                      <button type="button" onClick={() => setShowAllActivity((value) => !value)} className="w-full rounded-2xl border border-[#dfe6ea] bg-slate-50 px-3.5 py-2 text-left text-sm font-black text-emerald-700 transition hover:bg-slate-100 sm:w-auto sm:text-right">{showAllActivity ? "Tampilkan Ringkas" : "Lihat Semua Riwayat"}</button>
                    </div>
                    <div className="space-y-3">
                      {visibleActivityRows.map((row, index) => (
                        <article key={`${row[1]}-${row[2]}-${index}`} className="rounded-[22px] border border-[#edf2f5] bg-[linear-gradient(135deg,#ffffff_0%,#f9fcfb_100%)] px-4 py-3.5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black ${row[0] === "[LIVE]" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                                  {row[0] === "[LIVE]" ? "LIVE" : "Sesi"}
                                </span>
                                <p className="truncate text-sm font-black text-slate-900">{row[1]}</p>
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-500">{row[2]}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:w-auto">
                              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Jarak</p>
                                <p className="mt-1 text-sm font-black text-slate-900">{row[3]}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Durasi</p>
                                <p className="mt-1 text-sm font-black text-slate-900">{row[4]}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Kalori</p>
                                <p className="mt-1 text-sm font-black text-slate-900">{row[5]}</p>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="mt-4 grid gap-4 lg:grid-cols-3">
                    <article className="rounded-[26px] border border-[#e4eaee] bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.22)] sm:p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Ringkasan Aktivitas</p>
                      <h4 className="mt-1 text-lg font-black text-slate-900">Pembagian intensitas sesi</h4>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                          <span className="font-semibold text-slate-600">Aktivitas Ringan</span>
                          <span className="font-black text-slate-900">{hasTrackedActivity ? `${Math.round(activityIntensitySummary.ringan.durationSec / 60)} mnt | ${Math.round(activityIntensitySummary.ringan.calories)} kkal` : "-"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                          <span className="font-semibold text-slate-600">Aktivitas Sedang</span>
                          <span className="font-black text-slate-900">{hasTrackedActivity ? `${Math.round(activityIntensitySummary.sedang.durationSec / 60)} mnt | ${Math.round(activityIntensitySummary.sedang.calories)} kkal` : "-"}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                          <span className="font-semibold text-slate-600">Aktivitas Berat</span>
                          <span className="font-black text-slate-900">{hasTrackedActivity ? `${Math.round(activityIntensitySummary.berat.durationSec / 60)} mnt | ${Math.round(activityIntensitySummary.berat.calories)} kkal` : "-"}</span>
                        </div>
                      </div>
                    </article>
                    <article className="rounded-[26px] border border-[#e4eaee] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.22)]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Pencapaian Mingguan</p>
                      <h4 className="mt-1 text-lg font-black text-slate-900">Konsistensi gerak Anda</h4>
                      <p className="mt-4 text-3xl font-black text-emerald-700">{hasTrackedActivity && weeklyActivityStreak > 0 ? `${weeklyActivityStreak} Hari` : "-"}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        {hasTrackedActivity
                          ? weeklyActivityStreak > 1
                            ? "Streak berjalan baik. Pertahankan ritme harian Anda."
                            : "Mulai bangun ritme harian agar streak cepat terbentuk."
                          : "Belum ada pola mingguan yang bisa dihitung."}
                      </p>
                      <div className="mt-4 rounded-[20px] bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-600">Hari aktif minggu ini</span>
                          <span className="font-black text-slate-900">{hasTrackedActivity ? `${weeklyActiveDays}/7` : "-"}</span>
                        </div>
                      </div>
                    </article>
                    <article className="rounded-[26px] border border-[#e4eaee] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.22)]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Rekomendasi Untuk Anda</p>
                      <h4 className="mt-1 text-lg font-black text-slate-900">Langkah perbaikan berikutnya</h4>
                      <div className="mt-4 space-y-2.5 text-sm">
                        {(activityRecommendations.length > 0 ? activityRecommendations.slice(0, 3) : ["Mulai satu sesi aktivitas agar sistem dapat menyusun saran yang lebih akurat."]).map((tip) => (
                          <p key={tip} className="rounded-[18px] bg-emerald-50 px-4 py-3 leading-6 text-emerald-900">{tip}</p>
                        ))}
                      </div>
                    </article>
                  </section>

                  <section className="hidden mt-4 grid gap-4 lg:grid-cols-3">
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 sm:p-5">
                      <h4 className="mb-3 text-lg font-bold text-slate-900">Ringkasan Aktivitas</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Aktivitas Ringan</span><span className="font-semibold">{hasAnyData ? "45 mnt • 120 kkal" : "-"}</span></div>
                        <div className="flex justify-between"><span>Aktivitas Sedang</span><span className="font-semibold">{hasAnyData ? "20 mnt • 110 kkal" : "-"}</span></div>
                        <div className="flex justify-between"><span>Aktivitas Berat</span><span className="font-semibold">{hasAnyData ? "3 mnt • 82 kkal" : "-"}</span></div>
                      </div>
                    </article>
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <h4 className="mb-3 text-lg font-bold text-slate-900">Pencapaian Mingguan</h4>
                      <p className="text-2xl font-black text-emerald-700">{hasAnyData ? "3 Hari Berturut-turut" : "-"}</p>
                      <p className="text-sm text-slate-600">{hasAnyData ? "Pertahankan streak Anda!" : "-"}</p>
                    </article>
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <h4 className="mb-3 text-lg font-bold text-slate-900">Rekomendasi Untuk Anda</h4>
                      <div className="space-y-2 text-sm">
                        <p className="rounded-xl bg-emerald-50 px-3 py-2">{hasAnyData ? "Tingkatkan langkah harian Anda minimal 10.000 langkah." : "-"}</p>
                        <p className="rounded-xl bg-emerald-50 px-3 py-2">{hasAnyData ? "Coba berjalan kaki 15 menit setelah makan." : "-"}</p>
                        <p className="rounded-xl bg-emerald-50 px-3 py-2">{hasAnyData ? "Minum air yang cukup sebelum dan sesudah aktivitas." : "-"}</p>
                      </div>
                    </article>
                  </section>
                </>
              ) : null}

              {activeMenu === "Pola Makan" ? (
                <>
                  <section className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xl font-bold text-slate-900">Ringkasan Nutrisi Hari Ini</h3>
                      <button type="button" onClick={() => { if (isMobileViewport) { setMealSummaryRange((current) => (current === "Hari Ini" ? "7 Hari" : "Hari Ini")); return; } notify("Ringkasan nutrisi hari ini ditampilkan."); }} className="rounded-lg border border-[#dfe6ea] px-3 py-1 text-xs font-semibold text-slate-600">{isMobileViewport ? mealSummaryRange : "Hari Ini"}</button>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                      <article className="rounded-xl border border-[#e4eaee] p-4">
                        <div className="mx-auto grid h-40 w-40 place-items-center rounded-full border-[10px] border-emerald-500 text-center">
                          <div><p className="text-5xl font-black text-slate-900">{hasMealData ? mealCaloriesDisplay.toLocaleString("id-ID") : "-"}</p><p className="text-base text-slate-500">kkal</p></div>
                        </div>
                        <p className="mt-3 text-center text-lg font-semibold text-emerald-700">{hasMealData ? `${mealPercent}% dari target` : "-"}</p>
                      </article>
                      <div className="grid gap-3 md:grid-cols-3">
                        {nutritionCards.map((m) => (
                          <article key={m[1]} className="rounded-xl border border-[#e4eaee] p-3">
                            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><i className={`fa-solid ${m[0]}`} /></div>
                            <p className="text-xs font-semibold text-slate-500">{m[1]}</p>
                            <p className="mt-1 text-3xl font-black text-slate-900">{m[2]}</p>
                            <p className="text-xs text-slate-500">{m[3]}</p>
                            <p className="mt-2 text-xs text-slate-500">{m[4]}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="mt-4 grid gap-4 lg:grid-cols-3">
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-4">
                      <h4 className="text-lg font-bold text-slate-900">Distribusi Makronutrisi</h4>
                      <div className="mt-4 flex items-center gap-4">
                        <div className="h-28 w-28 rounded-full border-[10px] border-emerald-500 border-l-rose-500 border-r-blue-500 border-b-orange-400" />
                        <div className="space-y-2 text-sm">
                          <p className="text-emerald-600">● Karbohidrat {carbsDisplay > 0 ? `${carbsDisplay.toLocaleString("id-ID")} g` : "-"}</p>
                          <p className="text-rose-500">● Protein {proteinDisplay > 0 ? `${proteinDisplay.toLocaleString("id-ID")} g` : "-"}</p>
                          <p className="text-blue-500">● Lemak {fatDisplay > 0 ? `${fatDisplay.toLocaleString("id-ID")} g` : "-"}</p>
                          <p className="text-orange-500">● Lainnya {macroOtherDisplay > 0 ? `${macroOtherDisplay.toLocaleString("id-ID")} g` : "-"}</p>
                        </div>
                      </div>
                    </article>
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-4">
                      <h4 className="text-lg font-bold text-slate-900">Rekomendasi Harian</h4>
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="rounded-xl bg-emerald-50 px-3 py-2">{hasMealData ? "Penuhi kebutuhan air hari ini" : "-"}</p>
                        <p className="rounded-xl bg-emerald-50 px-3 py-2">{hasMealData ? "Tambah protein pada makan siang" : "-"}</p>
                        <p className="rounded-xl bg-amber-50 px-3 py-2">{hasMealData ? "Kurangi makanan tinggi gula" : "-"}</p>
                      </div>
                    </article>
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-4">
                      <h4 className="text-lg font-bold text-slate-900">Target Harian</h4>
                      <div className="mt-3 space-y-3 text-sm">
                        {[["Kalori", mealCaloriesDisplay > 0 ? `${mealCaloriesDisplay.toLocaleString("id-ID")} / ${Number(mealTargetForRange).toLocaleString("id-ID")} kkal` : "-", `${mealPercent}%`], ["Karbohidrat", carbsDisplay > 0 ? `${carbsDisplay.toLocaleString("id-ID")} / ${Number(carbTargetForRange).toLocaleString("id-ID")} g` : "-", `${carbsPercent}%`], ["Protein", proteinDisplay > 0 ? `${proteinDisplay.toLocaleString("id-ID")} / ${Number(proteinTargetForRange).toLocaleString("id-ID")} g` : "-", `${proteinPercent}%`], ["Lemak", fatDisplay > 0 ? `${fatDisplay.toLocaleString("id-ID")} / ${Number(fatTargetForRange).toLocaleString("id-ID")} g` : "-", `${fatPercent}%`], ["Air", waterDisplay > 0 ? `${waterDisplay.toLocaleString("id-ID")} / ${Number(waterTargetForRange).toLocaleString("id-ID")} gelas` : "-", `${waterPercent}%`], ["Serat", fiberDisplay > 0 ? `${fiberDisplay.toLocaleString("id-ID")} / ${Number(fiberTargetForRange).toLocaleString("id-ID")} g` : "-", `${fiberPercent}%`]].map((t) => (
                          <div key={t[0]}>
                            <div className="mb-1 flex justify-between"><span>{t[0]}</span><span>{t[1]}</span></div>
                            <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: hasMealData ? t[2] : "0%" }} /></div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </section>

                  <section className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-4">
                      <h4 className="mb-1 text-lg font-bold text-slate-900">Total 6 Parameter Hari Ini</h4>
                      <p className="mb-3 text-xs font-medium text-slate-500">Akumulasi dari semua makanan yang Anda klik sepanjang hari ini.</p>
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                        {mealHistoryToday.length > 0 ? (
                          mealHistoryToday.map((meal, index) => (
                            <div key={`${meal[0]}-${meal[1]}-${index}`} className="rounded-2xl border border-[#e4eaee] p-3 shadow-[0_8px_18px_rgba(15,23,42,0.03)]">
                              <p className="font-semibold text-slate-800">{meal[0]}</p>
                              <p className="text-xs text-slate-500">{meal[1]}</p>
                              <p className="mt-4 text-sm font-semibold">{meal[2]}</p>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full rounded-2xl border border-dashed border-[#d7e1e7] bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                            Belum ada riwayat makanan hari ini.
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => setMealPanel("Input Pola Makan")} className="mt-3 w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">Input Pola Makan</button>
                    </article>
                    <div className="space-y-4">
                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4">
                        <h4 className="text-lg font-bold text-slate-900">Asupan Air</h4>
                        <p className="mt-2 text-2xl font-black text-slate-900">{waterGlasses} / 8 <span className="text-sm font-semibold text-slate-500">gelas</span></p>
                        <p className="text-sm text-slate-500">{Math.min(100, Math.round((waterGlasses / 8) * 100))}%</p>
                        <button type="button" onClick={() => setMealPanel("Asupan Air")} className="mt-3 w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">Kelola Asupan Air</button>
                      </article>
                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4">
                        <h4 className="text-lg font-bold text-slate-900">Catatan Harian</h4>
                        <textarea className="mt-3 min-h-24 w-full resize-none rounded-xl border border-[#dfe6ea] px-3 py-2 text-sm" maxLength={200} placeholder="Bagaimana pola makan Anda hari ini?" value={mealNote} onChange={(event) => setMealNote(event.target.value)} />
                        <p className="mt-1 text-right text-xs text-slate-500">{mealNote.length}/200</p>
                        <button type="button" onClick={() => setMealPanel("Catatan Harian")} className="mt-2 w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">Buka Catatan Harian</button>
                      </article>
                    </div>
                  </section>
                </>
              ) : null}

              {activeMenu === "Edukasi" ? (
                <section className="mt-4">
                  <article className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                    <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#f8fbf9_0%,#ffffff_100%)] px-5 py-5 md:px-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-3xl">
                          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">Chat Edukasi</p>
                          <h4 className="mt-2 text-2xl font-black text-slate-950 md:text-[30px]">Tanya saja, saya jawab seperti bot kesehatan</h4>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                            Semua percakapan sekarang difokuskan ke chat. Tidak ada lagi card edukasi lama, jadi alurnya lebih bersih dan terasa seperti ngobrol dengan asisten.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {educationParameterChips.map((chip) => (
                            <span key={chip} className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {educationQuickQuestions.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => startEducationConversation(item.question)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                          >
                            <i className="fa-solid fa-bolt text-emerald-600" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[linear-gradient(180deg,#f7faf8_0%,#ffffff_100%)] px-4 py-5 md:px-6">
                      <div className="flex max-h-[68vh] min-h-[560px] flex-col gap-4 overflow-y-auto pr-1">
                        {educationChatMessages.length === 0 ? (
                          <div className="flex">
                            <div className="max-w-[92%] rounded-[28px] rounded-bl-md border border-emerald-100 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.04)] md:max-w-[78%]">
                              <p className="font-black text-slate-950">Saya siap bantu.</p>
                              <p className="mt-1">
                                Coba tanya tentang BMI, tekanan darah, detak jantung, aktivitas, hidrasi, atau pola makan.
                              </p>
                              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                Topik aktif: {topicLabelForUi}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {educationChatMessages.map((message) => {
                          const isUser = message.role === "user";
                          return (
                            <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[92%] rounded-[28px] px-4 py-3 text-sm leading-6 shadow-[0_12px_28px_rgba(15,23,42,0.04)] md:max-w-[78%] ${
                                  isUser
                                    ? "rounded-br-md bg-emerald-700 text-white"
                                    : "rounded-bl-md border border-emerald-100 bg-white text-slate-700"
                                }`}
                              >
                                <div className={`mb-2 flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] ${isUser ? "text-emerald-100" : "text-emerald-700"}`}>
                                  <span>{isUser ? "Anda" : "Asisten Kesehatan"}</span>
                                  <span className={isUser ? "text-emerald-100/80" : "text-slate-400"}>
                                    {formatLocalTime(message.createdAt)}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                                {!isUser ? (
                                  <div className="mt-3 flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => speakEducationAnswer(message.text)}
                                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                                      disabled={!educationSpeechOutputSupported}
                                    >
                                      <i className="fa-solid fa-volume-high" />
                                      Dengarkan
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={educationChatEndRef} />
                      </div>
                    </div>

                    <div className="border-t border-slate-100 bg-white px-4 py-4 md:px-6">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <textarea
                          value={educationChatInput}
                          onChange={(event) => setEducationChatInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendEducationChatMessage();
                            }
                          }}
                          className="min-h-[72px] flex-1 resize-none rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          maxLength={240}
                          placeholder="Tulis pertanyaan kesehatan Anda di sini..."
                        />
                        <div className="flex items-center gap-2 self-end md:self-auto">
                          <button
                            type="button"
                            onClick={() => startEducationVoiceInput()}
                            className={`grid h-12 w-12 place-items-center rounded-full border text-white shadow-[0_14px_28px_rgba(15,23,42,0.14)] transition ${
                              educationListening
                                ? "border-rose-300 bg-rose-600 hover:bg-rose-500"
                                : "border-emerald-200 bg-emerald-700 hover:bg-emerald-800"
                            }`}
                            aria-label={educationListening ? "Hentikan rekaman suara" : "Bicara dengan suara"}
                            disabled={!educationSpeechInputSupported}
                            title={educationSpeechInputSupported ? "Gunakan mikrofon untuk mengisi pertanyaan" : "Browser belum mendukung input suara"}
                          >
                            <i className={`fa-solid ${educationListening ? "fa-stop" : "fa-microphone"} text-base`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void sendEducationChatMessage()}
                            className="grid h-12 w-12 place-items-center rounded-full bg-emerald-700 text-white shadow-[0_14px_28px_rgba(16,185,129,0.18)] transition hover:bg-emerald-800"
                            aria-label="Kirim pertanyaan"
                          >
                            <i className="fa-solid fa-paper-plane text-base" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                          <i className="fa-solid fa-shield-heart" />
                          Edukasi, bukan diagnosis
                        </span>
                        <span>Tekan Enter untuk kirim, Shift+Enter untuk baris baru.</span>
                      </div>
                    </div>
                  </article>
                </section>
              ) : null}

              {activeMenu === "Riwayat" ? (
                <Suspense fallback={LAZY_PAGE_FALLBACK}>
                  <RiwayatPage
                    embedded
                    historyLoading={historyLoading}
                    historyResetting={historyResetting}
                    historyFilter={normalizedHistoryFilter}
                    onSetHistoryFilter={setHistoryFilter}
                    onExportHistory={exportHistoryData}
                    onResetMeasurements={() => {
                      void resetMeasurementHistory();
                    }}
                    onShowChartRange={(label) => notify(`Grafik menampilkan ${label.toLowerCase()}.`)}
                    historyCharts={historyCharts}
                    measurementHistoryRows={measurementHistoryRows}
                    historyDetailRows={historyDetailRows}
                    hasAnyData={hasAnyData}
                    hasBloodPressure={hasBloodPressure}
                    bloodPressure={bloodPressure}
                    hasHeartRate={hasHeartRate}
                    heartRate={heartRate}
                    onRowAction={(row) => notify(`${row[1]}: ${row[2]}`)}
                    onShowReport={() => notify("Laporan lengkap sedang disiapkan.")}
                  />
                </Suspense>
              ) : null}

              {activeMenu === "Pengingat & Alarm" ? (
                <>
                  <section className="mb-4 flex justify-end">
                    <button type="button" onClick={() => setReminderModal("add")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_20px_rgba(5,122,91,0.16)] sm:w-auto sm:px-8">
                      <i className="fa-solid fa-plus" />
                      Tambah Pengingat
                    </button>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {reminderStats.map((stat) => (
                      <article key={stat[1]} className="grid min-h-[132px] grid-cols-[64px_1fr] items-center gap-4 rounded-2xl border border-[#e4eaee] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                        <ReminderIcon icon={stat[0]} color={stat[4]} size="lg" />
                        <div>
                          <p className="text-xs font-bold text-slate-500">{stat[1]}</p>
                          <p className="mt-1 text-3xl font-black leading-none text-slate-900">{stat[1] === "Aktif" ? activeReminderCount : stat[1] === "Selesai Hari Ini" ? completedReminderCount : stat[2]}</p>
                          <p className="mt-3 text-xs font-medium text-slate-500">{stat[3]}</p>
                        </div>
                      </article>
                    ))}
                  </section>

                  <section className="mt-4 grid items-start gap-4 xl:grid-cols-[1.7fr_1fr]">
                    <div className="space-y-4">
                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:p-5">
                        <h3 className="text-xl font-black text-slate-900">Pengingat Aktif</h3>
                        <div className="mt-4 grid min-w-0 grid-cols-2 overflow-hidden rounded-lg border border-[#dfe6ea] text-center text-xs font-bold text-slate-600 sm:grid-cols-3 lg:grid-cols-5">
                          {reminderTabs.map((tab) => (
                            <button key={tab} type="button" onClick={() => setReminderTab(tab)} className={`h-11 border-r border-[#eef2f6] last:border-r-0 ${reminderTab === tab ? "bg-emerald-50 text-emerald-700 shadow-[inset_0_-2px_0_#059669]" : "bg-white"}`}>{tab}</button>
                          ))}
                        </div>
                        {filteredActiveReminders.length > 0 ? (
                          <div className="mt-4 divide-y divide-[#eef2f6]">
                            {filteredActiveReminders.map((item) => (
                              <div key={item.id} className="grid min-h-[86px] grid-cols-[44px_1fr_auto] items-center gap-3 py-3 sm:min-h-[72px] sm:grid-cols-[52px_1fr_92px_50px_40px] sm:py-0">
                                <ReminderIcon icon={item.icon} color={item.color} />
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-slate-900">{item.title}</p>
                                  <p className="mt-1 text-xs font-medium text-slate-500">{item.description}</p>
                                </div>
                                <div>
                                  <p className="text-right text-xl font-black text-slate-900">{item.time}</p>
                                  <p className="mt-1 text-right text-xs text-slate-500">{item.frequency}</p>
                                </div>
                                <ReminderToggle checked={reminderEnabled[item.title]} onToggle={() => void toggleReminderEnabled(item)} />
                                <button type="button" onClick={() => openEditReminder(item)} className="col-span-3 text-left text-xs font-black text-emerald-700 sm:col-span-1 sm:text-right">Edit</button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            icon="fa-bell-slash"
                            title="Belum ada pengingat aktif"
                            description="Tambahkan pengingat untuk minum air, olahraga, obat, tidur, atau cek kesehatan."
                            primaryAction="Tambah Pengingat"
                            onPrimaryAction={() => setReminderModal("add")}
                            secondaryAction="Gunakan Rekomendasi"
                            onSecondaryAction={() => setReminderModal("recommendation")}
                          />
                        )}
                      </article>

                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:p-5">
                        <h3 className="text-lg font-black text-slate-900">Kategori Pengingat</h3>
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          {reminderCategories.map((cat) => (
                            <div key={cat[1]} className="min-h-[106px] rounded-xl border border-[#e4eaee] p-3 text-center">
                              <div className="mx-auto w-fit"><ReminderIcon icon={cat[0]} color={cat[3]} /></div>
                              <p className="mt-2 text-xs font-bold text-slate-700">{cat[1]}</p>
                              <p className="mt-1 text-lg font-black text-slate-900">{cat[2]}</p>
                            </div>
                          ))}
                        </div>
                      </article>

                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:p-5">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-lg font-black text-slate-900">Log Pengingat Hari Ini</h3>
                          <button type="button" onClick={() => { if (isMobileViewport) { setShowAllReminderLogs((value) => !value); return; } notify("Semua log pengingat sudah ditampilkan."); }} className="w-full text-left text-xs font-bold text-emerald-700 sm:w-auto sm:text-right">{isMobileViewport ? (showAllReminderLogs ? "Ringkas" : "Lihat Semua") : "Lihat Semua"}</button>
                        </div>
                        {reminderLogs.length > 0 ? (
                          <div className="divide-y divide-[#eef2f6] text-sm">
                            {(isMobileViewport ? visibleReminderLogs : reminderLogs).map((log) => (
                              <div key={log.id + log.hour} className="grid min-h-12 grid-cols-[56px_34px_1fr] items-center gap-2 sm:h-10 sm:grid-cols-[70px_34px_1fr_110px]">
                                <span className="font-bold text-slate-900">{log.hour}</span>
                                <ReminderIcon icon={log.icon} color={log.color} size="sm" />
                                <span className="font-bold text-slate-800">{log.title}</span>
                                <span className={`col-span-3 text-right text-xs font-bold sm:col-span-1 ${log.status === "Selesai" ? "text-emerald-700" : "text-amber-600"}`}>{log.status}</span>
                              </div>
                            ))}
                          </div>
                        ) : <EmptyState icon="fa-clipboard-list" title="Belum ada log hari ini" description="Log akan terisi otomatis setelah pengingat berjalan." />}
                      </article>
                    </div>

                    <div className="space-y-4">
                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:p-5">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-xl font-black text-slate-900">Pengingat Akan Datang</h3>
                          <button type="button" onClick={() => setShowAllUpcoming((value) => !value)} className="w-full text-left text-xs font-bold text-emerald-700 sm:w-auto sm:text-right">{showAllUpcoming ? "Ringkas" : "Lihat Semua"}</button>
                        </div>
                        {visibleUpcomingReminders.length > 0 ? (
                          <div className="divide-y divide-[#eef2f6]">
                            {visibleUpcomingReminders.map((item) => (
                              <div key={item.id} className="grid min-h-[76px] grid-cols-[52px_1fr_72px] items-center gap-3">
                                <ReminderIcon icon={item.icon} color={item.color} />
                                <div>
                                  <p className="text-sm font-black text-slate-900">{item.title}</p>
                                  <p className="mt-1 text-xs font-medium text-slate-500">{item.note}</p>
                                </div>
                                <p className="text-right text-xl font-black text-slate-900">{item.time}</p>
                              </div>
                            ))}
                          </div>
                        ) : <EmptyState icon="fa-clock" title="Belum ada pengingat akan datang" description="Jadwal pengingat berikutnya akan muncul setelah Anda membuat pengingat." />}
                      </article>

                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:p-5">
                        <h3 className="text-xl font-black text-slate-900">Rekomendasi Pengingat Pintar</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500">Berdasarkan data kesehatan dan aktivitas Anda</p>
                        {visibleSmartReminderRows.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {visibleSmartReminderRows.map((item) => (
                              <div key={item[1]} className="grid grid-cols-[42px_1fr] items-center gap-3 sm:grid-cols-[42px_1fr_auto]">
                                <ReminderIcon icon={item[0]} color={item[3]} size="sm" />
                                <div>
                                  <p className="text-sm font-black text-slate-900">{item[1]}</p>
                                  <p className="text-[11px] font-medium text-slate-500">{item[2]}</p>
                                </div>
                                <button type="button" onClick={() => addSmartReminder(item[1])} className={`col-span-2 rounded-full px-3 py-1 text-[11px] font-black sm:col-span-1 ${addedRecommendations.includes(item[1]) ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>{addedRecommendations.includes(item[1]) ? "Ditambahkan" : "+ Tambahkan"}</button>
                              </div>
                            ))}
                          </div>
                        ) : <EmptyState icon="fa-lightbulb" title="Belum ada rekomendasi" description="Rekomendasi akan muncul saat data kesehatan sudah tersedia." />}
                        {visibleSmartReminderRows.length > 0 ? <button type="button" onClick={() => setShowAllRecommendations((value) => !value)} className="mt-4 w-full rounded-lg border border-[#dfe6ea] py-2 text-xs font-black text-emerald-700">{showAllRecommendations ? "Ringkas Rekomendasi" : "Lihat Semua Rekomendasi"}</button> : null}
                      </article>

                      <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] sm:p-5">
                        <h3 className="text-lg font-black text-slate-900">Pengaturan Alarm</h3>
                        <div className="mt-4 divide-y divide-[#eef2f6] text-sm">
                          <AlarmSetting icon="fa-bell" label="Suara Alarm" value={alarmSound} onClick={() => setAlarmPanel("sound")} />
                          <div className="flex h-12 items-center justify-between">
                            <div className="flex items-center gap-3 font-bold text-slate-800"><i className="fa-solid fa-vibration text-slate-500" />Getar</div>
                            <ReminderToggle checked={alarmVibration} onToggle={() => setAlarmVibration((value) => !value)} />
                          </div>
                          <AlarmSetting icon="fa-clock-rotate-left" label="Snooze" value={alarmSnooze} onClick={() => setAlarmPanel("snooze")} />
                          <div className="flex flex-col gap-3 py-3 sm:h-12 sm:flex-row sm:items-center sm:gap-4">
                            <div className="flex items-center gap-3 font-bold text-slate-800 sm:min-w-[96px]"><i className="fa-solid fa-volume-high text-slate-500" />Volume</div>
                            <input type="range" min="0" max="100" value={alarmVolume} onChange={(event) => { const nextVolume = Number(event.target.value); setAlarmVolume(nextVolume); playAlarmPreview(nextVolume); }} className="h-2 flex-1 accent-emerald-600" />
                            <span className="text-right text-xs font-black text-slate-500 sm:w-10">{alarmVolume}%</span>
                          </div>
                          <button type="button" onClick={() => playAlarmPreview(alarmVolume, alarmSound, true)} className="mt-3 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50">
                            Tes Suara Alarm
                          </button>
                        </div>
                      </article>
                    </div>
                  </section>
                </>
              ) : null}

              {activeMenu === "Pengaturan" ? (
                <>
                  <PageContainer className="md:max-w-none md:space-y-4">
                    <SectionTitle
                      title="Pengaturan Akun"
                      subtitle="Kelola profil, perangkat, notifikasi, dan preferensi aplikasi Anda."
                      className="px-1 md:hidden"
                    />
                    <section className="grid items-stretch gap-4 xl:grid-cols-[1.18fr_.82fr]">
                      <AppCard className="p-4 sm:p-5">
                        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-base font-black text-slate-900 sm:text-lg">Profil Akun</h3>
                          <SecondaryButton
                            type="button"
                            onClick={() => {
                              setDraftProfile(profile);
                              setIsEditingProfile(true);
                            }}
                            className="sm:w-auto"
                          >
                            <i className="fa-solid fa-pen-to-square mr-2" />
                            Edit Profil
                          </SecondaryButton>
                        </div>
                        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[1fr_1.05fr]">
                          <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#edf2f5] bg-slate-50/60 p-3.5 sm:flex-row sm:items-center">
                            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-slate-100 text-xl text-slate-700">
                              <i className="fa-solid fa-user" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-base font-black text-slate-900 sm:text-lg">{name}</p>
                              <p className="truncate text-[13px] font-bold text-emerald-700">{profile.username ? `@${profile.username}` : "-"}</p>
                              <p className="truncate text-[13px] font-medium text-slate-500">{profile.email || "-"}</p>
                              <p className="truncate text-[13px] font-medium text-slate-500">{profile.phone || "-"}</p>
                              <p className="text-[13px] font-medium text-slate-500">{profileMetaLine}</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#edf2f5] bg-white">
                            {profileDetails.map((detail, idx) => (
                              <div key={detail[0]} className={`grid grid-cols-1 gap-1 px-3.5 py-2.5 text-sm sm:grid-cols-[120px_1fr] sm:gap-2 ${idx === 0 ? "" : "border-t border-[#eef2f6]"}`}>
                                <span className="font-medium text-slate-500">{detail[0]}</span>
                                <span className="font-black text-slate-900 sm:text-right">{detail[1]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </AppCard>

                      <AppCard className="flex flex-col p-4 sm:p-5">
                        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-base font-black text-slate-900 sm:text-lg">Perangkat & Koneksi</h3>
                          <SecondaryButton type="button" onClick={() => { setDeviceConnectError(""); void connectDeviceToFirebase(DEFAULT_DEVICE_ID); }} className="sm:w-auto">Connect Device</SecondaryButton>
                        </div>
                        <div className="mt-4 flex-1 rounded-xl border border-[#edf2f5]">
                          <div className="grid grid-cols-[44px_1fr] items-start gap-3 px-4 py-3 sm:grid-cols-[44px_1fr_auto] sm:items-center">
                            <ReminderIcon icon="fa-microchip" color="emerald" size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900">{deviceIdentity.deviceId}</p>
                              <p className="truncate text-xs font-medium text-slate-500">ID User: {deviceIdentity.userId}</p>
                            </div>
                            <span className={`mt-2 inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-black sm:mt-0 ${deviceStatusTone}`}>{deviceStatus}</span>
                          </div>
                          <div className="grid grid-cols-[44px_1fr] items-center gap-3 border-t border-[#eef2f6] px-4 py-3">
                            <ReminderIcon icon={isDeviceOnline ? "fa-rotate" : isDeviceLinked ? "fa-clock" : "fa-plug-circle-xmark"} color={isDeviceOnline ? "emerald" : isDeviceLinked ? "orange" : "rose"} size="sm" />
                            <div>
                              <p className="text-sm font-black text-slate-900">Sinkronisasi Terakhir</p>
                              <p className="text-xs font-medium text-slate-500">{deviceSyncLabel}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-[44px_1fr] items-center gap-3 border-t border-[#eef2f6] px-4 py-3">
                            <ReminderIcon icon="fa-microchip" color={isDeviceOnline ? "emerald" : isDeviceLinked ? "orange" : "slate"} size="sm" />
                            <p className="text-xs font-medium text-slate-500">{isDeviceOnline ? `Online untuk ${deviceIdentity.userName}` : isDeviceLinked ? `Tertaut untuk ${deviceIdentity.userName}, menunggu alat kirim data` : "Tautkan ESP32-S3 ke Firebase"}</p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {isDeviceConnected ? (
                            <PrimaryButton type="button" onClick={syncDeviceData}>Sinkronisasi Sekarang</PrimaryButton>
                          ) : (
                            <SecondaryButton
                              type="button"
                              onClick={() => {
                                setDeviceConnectError("");
                                void connectDeviceToFirebase(DEFAULT_DEVICE_ID);
                              }}
                              className="border-rose-200 text-rose-600 hover:bg-rose-50"
                            >
                              Connect Device
                            </SecondaryButton>
                          )}
                          <SecondaryButton type="button" onClick={() => setConnectDeviceModalOpen(true)} className="sm:w-auto">
                            Buka Panel Device
                          </SecondaryButton>
                        </div>
                      </AppCard>

                      <AppCard className="flex flex-col p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Machine Learning</p>
                            <h3 className="mt-1 text-base font-black text-slate-900 sm:text-lg">Prediksi Status Kesehatan</h3>
                          </div>
                          <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">Decision Tree</span>
                        </div>
                        <div className="mt-4 space-y-3 rounded-2xl border border-[#edf2f5] bg-slate-50/70 p-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Hasil Prediksi</p>
                            <p className="mt-1 text-2xl font-black text-slate-900">
                              {healthPrediction ? healthPrediction.healthStatusLabel : "Menunggu data yang cukup"}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {healthPrediction
                                ? healthPrediction.recommendation
                                : "Model akan membaca usia, gender, tinggi, berat, BMI, detak jantung, tekanan darah, dan langkah harian."}
                            </p>
                            <p className="mt-2 text-[12px] leading-5 text-slate-500">
                              Prediksi ini untuk dukungan skripsi dan pemantauan awal, bukan diagnosis medis.
                            </p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Model</p>
                              <p className="mt-1 text-sm font-black text-slate-900">{HEALTH_MODEL_METADATA.modelName}</p>
                            </div>
                            <div className="rounded-xl bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Akurasi Model</p>
                              <p className="mt-1 text-sm font-black text-slate-900">{(HEALTH_MODEL_METADATA.accuracy * 100).toFixed(2)}%</p>
                            </div>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Confidence</p>
                            <p className="mt-1 text-sm font-black text-slate-900">
                              {healthPrediction ? `${(healthPrediction.confidence * 100).toFixed(2)}%` : "-"}
                            </p>
                          </div>
                        </div>
                      </AppCard>
                    </section>

                    <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-3">
                      <AppCard className="flex flex-col p-4 sm:p-5 md:min-h-[264px]">
                        <SettingTitle icon="fa-bullseye" color="orange" title="Tujuan & Target" />
                        <div className="mt-4 flex-1 divide-y divide-[#eef2f6]">
                          {targetSettings.map((row) => <SettingLine key={row[0]} label={row[0]} value={row[1]} onClick={() => setActiveSettingsPanel("Tujuan & Target")} />)}
                        </div>
                        <SecondaryButton type="button" onClick={() => setActiveSettingsPanel("Tujuan & Target")} className="mt-4">Ubah Target</SecondaryButton>
                      </AppCard>

                      <AppCard className="flex flex-col p-4 sm:p-5 md:min-h-[264px]">
                        <SettingTitle icon="fa-bell" color="sky" title="Notifikasi" />
                        <div className="mt-4 flex-1 space-y-3">
                          {["Pengingat Minum Air", "Pengingat Aktivitas", "Pengingat Pola Makan"].map((label) => (
                            <div key={label} className="flex h-8 items-center justify-between text-sm font-medium text-slate-600"><span>{label}</span><ReminderToggle checked={notificationSettings[label]} onToggle={() => setNotificationSettings((items) => ({ ...items, [label]: !items[label] }))} /></div>
                          ))}
                          <div className="flex h-8 items-center justify-between text-sm font-medium text-slate-600"><span>Ringkasan Harian</span><ReminderToggle checked={notificationSettings["Ringkasan Harian"]} onToggle={() => setNotificationSettings((items) => ({ ...items, "Ringkasan Harian": !items["Ringkasan Harian"] }))} /></div>
                        </div>
                        <SecondaryButton type="button" onClick={() => setActiveSettingsPanel("Notifikasi")} className="mt-4">Kelola Notifikasi</SecondaryButton>
                      </AppCard>

                      <AppCard className="flex flex-col p-4 sm:p-5 md:min-h-[264px]">
                        <SettingTitle icon="fa-ruler-combined" color="violet" title="Satuan Pengukuran" />
                        <div className="mt-4 flex-1 divide-y divide-[#eef2f6]">
                          {unitSettings.map((row) => <SettingLine key={row[0]} label={row[0]} value={row[1]} onClick={() => setActiveSettingsPanel("Satuan Pengukuran")} />)}
                        </div>
                        <SecondaryButton type="button" onClick={() => setActiveSettingsPanel("Satuan Pengukuran")} className="mt-4">Ubah Satuan</SecondaryButton>
                      </AppCard>
                    </section>

                    <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-2 2xl:grid-cols-4">
                      <AppCard className="flex flex-col p-4 sm:p-5 md:min-h-[268px]">
                        <SettingTitle icon="fa-shield-halved" color="blue" title="Privasi & Keamanan" />
                        <div className="mt-4 flex-1 divide-y divide-[#eef2f6]">
                          {["Ubah Kata Sandi", "Kelola Data", "Izin Akses"].map((row) => <SettingLine key={row} label={row} value="" onClick={() => setActiveSettingsPanel("Privasi & Keamanan")} />)}
                        </div>
                        <SecondaryButton type="button" onClick={() => setActiveSettingsPanel("Privasi & Keamanan")} className="mt-4">Kelola Keamanan</SecondaryButton>
                      </AppCard>

                      <AppCard className="flex flex-col p-4 sm:p-5 md:min-h-[268px]">
                        <SettingTitle icon="fa-globe" color="slate" title="Bahasa" />
                        <div className="mt-4 flex-1 space-y-3 text-sm font-black">
                          {["Bahasa Indonesia", "English"].map((item) => (
                            <button key={item} type="button" onClick={() => setLanguage(item)} className={`flex h-9 w-full items-center justify-between rounded-lg px-2 text-left ${language === item ? "bg-emerald-50 text-emerald-700" : "text-slate-700"}`}><span>{item}</span>{language === item ? <i className="fa-solid fa-check" /> : null}</button>
                          ))}
                        </div>
                        <SecondaryButton type="button" onClick={() => setActiveSettingsPanel("Bahasa")} className="mt-4">Kelola Bahasa</SecondaryButton>
                      </AppCard>

                      <AppCard className="flex flex-col p-4 sm:p-5 md:min-h-[268px]">
                        <SettingTitle icon="fa-palette" color="sky" title="Tema" />
                        <div className="mt-4 flex-1 space-y-2 text-sm font-black">
                          {(["Terang", "Gelap", "Sistem"] as const).map((item, idx) => (
                            <button key={item} type="button" onClick={() => setTheme(item)} className={`flex h-10 w-full items-center justify-between rounded-lg px-3 ${theme === item ? "bg-slate-100 text-slate-900" : "text-slate-700"}`}>
                              <span className="flex items-center gap-2"><i className={`fa-solid ${idx === 0 ? "fa-sun text-amber-500" : idx === 1 ? "fa-moon text-slate-500" : "fa-circle-half-stroke text-slate-500"}`} />{item}</span>
                              {theme === item ? <i className="fa-solid fa-circle-check text-emerald-700" /> : null}
                            </button>
                          ))}
                        </div>
                        <SecondaryButton type="button" onClick={() => notify(`Tema disimpan: ${theme}.`)} className="mt-4">Simpan Tema</SecondaryButton>
                      </AppCard>

                      <AppCard className="flex flex-col p-4 sm:p-5 md:min-h-[268px]">
                        <SettingTitle icon="fa-circle-info" color="sky" title="Tentang Aplikasi" />
                        <div className="flex-1">
                          <p className="mt-4 text-xl font-black text-slate-900">Health Monitoring System</p>
                          <p className="mt-1 text-sm text-slate-500">Versi 1.0.0</p>
                          <p className="mt-4 text-sm leading-6 text-slate-600">Aplikasi monitoring kesehatan berbasis AI untuk hidup lebih sehat.</p>
                        </div>
                        <SecondaryButton type="button" onClick={() => { if (isMobileViewport) { setActiveSettingsPanel("Tentang Aplikasi"); return; } notify("Detail aplikasi dibuka."); }} className="mt-4">Lihat Detail</SecondaryButton>
                      </AppCard>
                    </section>

                    <AppCard className="p-4 sm:p-5">
                      <div className="grid items-center gap-4 xl:grid-cols-[1fr_280px_280px]">
                        <div>
                          <SettingTitle icon="fa-headset" color="sky" title="Bantuan & Dukungan" />
                          <p className="mt-2 text-sm text-slate-500">Butuh bantuan? Kami siap membantu Anda.</p>
                        </div>
                        <SecondaryButton type="button" onClick={() => setActiveSettingsPanel("Pusat Bantuan")} className="h-12 w-full xl:w-auto"><i className="fa-solid fa-life-ring mr-2" />Pusat Bantuan</SecondaryButton>
                        <SecondaryButton type="button" onClick={() => setActiveSettingsPanel("Hubungi Kami")} className="h-12 w-full xl:w-auto"><i className="fa-solid fa-phone mr-2" />Hubungi Kami</SecondaryButton>
                      </div>
                    </AppCard>
                  </PageContainer>
                </>
              ) : null}

              {activeMenu === "Dashboard" || activeMenu === "Pengukuran Manual" || activeMenu === "Aktivitas" || activeMenu === "Pola Makan" || activeMenu === "Edukasi" || activeMenu === "Riwayat" || activeMenu === "Pengingat & Alarm" || activeMenu === "Pengaturan" ? null : (
                <>
                  <section className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_.85fr]">
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <div className="mb-3 flex items-center justify-between"><h4 className="text-xl font-bold text-slate-900">Tren Aktivitas 7 Hari Terakhir</h4><button type="button" className="rounded-lg border border-[#dfe6ea] px-3 py-1 text-xs font-semibold text-slate-600">Langkah</button></div>
                      <div className="flex h-52 items-end gap-3">
                        {weekly.map((value, idx) => (
                          <div key={idx} className="flex flex-1 flex-col items-center gap-1">
                            <span className="text-[10px] font-semibold text-slate-500">{value > 0 ? value.toLocaleString("id-ID") : "-"}</span>
                            <div className="w-full rounded-md bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${value > 0 ? Math.max(18, (value / weekMax) * 130) : 8}px`, opacity: value > 0 ? 1 : 0.2 }} />
                            <span className="text-[10px] text-slate-500">{weekLabels[idx]}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <h4 className="text-xl font-bold text-slate-900">Status Kesehatan</h4>
                      <div className="mt-4 space-y-2 text-sm">
                        <StatusRow label="Tekanan Darah" value={hasBloodPressure ? bloodPressure : "-"} unit="mmHg" status={bpStatus} />
                        <StatusRow label="Detak Jantung" value={hasHeartRate ? String(heartRate) : "-"} unit="bpm" status={hrStatus} />
                        <StatusRow label="Berat Badan" value={hasWeight ? String(weight) : "-"} unit="kg" status={hasWeight ? "Normal" : "-"} />
                        <StatusRow label="Tinggi Badan" value={hasHeight ? String(height) : "-"} unit="cm" status={hasHeight ? "Normal" : "-"} />
                      </div>
                    </article>
                  </section>

                  <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <h4 className="mb-3 text-lg font-bold text-slate-900">Aktivitas Terakhir</h4>
                      {activityRows.map((row) => (
                        <div key={row[1]} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-[#eef2f6] py-3 text-sm sm:grid-cols-[1.4fr_auto_auto_auto]">
                          <div className="min-w-0"><p className="font-semibold">{row[0]} {row[1]}</p><p className="text-xs text-slate-500">{row[2]}</p></div>
                          <span className="font-semibold">{row[3]}</span>
                          <span className="hidden font-semibold sm:inline">{row[4]}</span>
                          <span className="hidden font-semibold sm:inline">{row[5]}</span>
                        </div>
                      ))}
                    </article>
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <h4 className="mb-3 text-lg font-bold text-slate-900">Pengingat Selanjutnya</h4>
                      {reminderRows.map((row) => (
                        <div key={row[1]} className="flex items-center justify-between border-b border-[#eef2f6] py-3 text-sm">
                          <div><p className="font-semibold">{row[0]} {row[1]}</p><p className="text-xs text-slate-500">{row[2]}</p></div>
                          <span className="font-bold">{row[3]}</span>
                        </div>
                      ))}
                    </article>
                  </section>

                  <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <h4 className="mb-3 text-lg font-bold text-slate-900">Edukasi & Saran Hari Ini</h4>
                      <p className="text-sm text-slate-600">
                        {hasAnyData
                          ? "Analisis kesehatan Anda menunjukkan kondisi yang baik. Pertahankan pola hidup sehat dan tingkatkan aktivitas fisik untuk hasil yang lebih optimal."
                          : "-"}
                      </p>
                      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-semibold">
                        {(hasAnyData ? ["Tingkatkan Aktivitas", "Perbanyak Sayur", "Minum Air Cukup", "Tidur 7-8 Jam"] : ["-", "-", "-", "-"]).map((tip) => (
                          <div key={tip} className="rounded-xl border border-[#e7edf3] px-2 py-3">{tip}</div>
                        ))}
                      </div>
                    </article>
                    <article className="rounded-2xl border border-[#e4eaee] bg-white p-5">
                      <h4 className="mb-3 text-lg font-bold text-slate-900">Pola Makan Hari Ini</h4>
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <span>📈</span>
                        <span>{hasMealData ? `${mealPercent}% dari target harian` : "-"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="grid h-32 w-32 place-items-center rounded-full border-[10px] border-emerald-500 border-l-blue-500 border-r-orange-400 border-b-rose-500">
                          <p className="text-center text-2xl font-black text-slate-900">{hasMealData ? totalMealCalories.toLocaleString("id-ID") : "-"}<br /><span className="text-xs font-semibold">{hasMealData ? "kcal" : "-"}</span></p>
                        </div>
                        <div className="space-y-2 text-sm font-semibold">
                          <p className="text-emerald-600">● Karbohidrat {hasAnyData ? "210g" : "-"}</p>
                          <p className="text-blue-500">● Protein {hasAnyData ? "75g" : "-"}</p>
                          <p className="text-rose-500">● Lemak {hasAnyData ? "45g" : "-"}</p>
                          <p className="text-orange-500">● Lainnya {hasAnyData ? "20g" : "-"}</p>
                        </div>
                      </div>
                      <div className="mt-4 h-2 w-full rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: hasAnyData ? "82%" : "0%" }} />
                      </div>
                    </article>
                  </section>
                </>
              )}

              <BottomNavigation
                className="md:hidden"
                items={mobileBottomNav.map((item) => ({
                  key: item.menu,
                  label: item.shortLabel,
                  icon: item.icon,
                  active: activeMenu === item.menu,
                  onClick: () => setActiveMenu(item.menu),
                }))}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Card({ icon, color, title, value, unit, note }: { icon: string; color: "emerald" | "sky" | "rose" | "orange" | "indigo" | "amber"; title: string; value: string; unit: string; note: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    sky: "bg-sky-50 text-sky-600",
    rose: "bg-rose-50 text-rose-600",
    orange: "bg-orange-50 text-orange-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <article className="min-h-[122px] sm:min-h-[136px] bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 sm:p-4">
      <div className={`mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${colorMap[color]}`}><i className={`fa-solid ${icon}`} /></div>
      <p className="text-[10px] font-semibold text-slate-500 sm:text-[11px]">{title}</p>
      <p className="mt-2 text-[22px] font-black leading-none text-slate-900 sm:text-[26px]">{value}</p>
      <p className="text-[10px] text-slate-500 sm:text-[11px]">{unit}</p>
      <p className="mt-2 text-[10px] font-semibold text-emerald-700 sm:text-[11px]">{note}</p>
    </article>
  );
}

function StatusRow({ label, value, unit, status }: { label: string; value: string; unit: string; status: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-800">
        {value} <span className="text-slate-500">{unit}</span>
      </span>
      <span className="col-span-2 text-xs font-semibold text-emerald-700 sm:col-span-1 sm:justify-self-end">{status}</span>
    </div>
  );
}

function ReminderIcon({ icon, color, size = "md" }: { icon: string; color: string; size?: "sm" | "md" | "lg" }) {
  const colorMap: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    orange: "bg-orange-50 text-orange-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-50 text-slate-600",
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  const sizeMap = {
    sm: "h-7 w-7 rounded-lg text-xs",
    md: "h-11 w-11 rounded-xl text-lg",
    lg: "h-14 w-14 rounded-2xl text-2xl",
  };

  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${sizeMap[size]} ${colorMap[color] ?? colorMap.emerald}`}>
      <i className={`fa-solid ${icon}`} />
    </span>
  );
}

function ReminderToggle({ checked = true, onToggle }: { checked?: boolean; onToggle?: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`relative h-6 w-11 rounded-full shadow-inner transition ${checked ? "bg-emerald-600" : "bg-slate-200"}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "right-1" : "left-1"}`} />
    </button>
  );
}

function AlarmSetting({ icon, label, value, onClick }: { icon: string; label: string; value: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-12 w-full items-center justify-between text-left">
      <div className="flex items-center gap-3 font-bold text-slate-800"><i className={`fa-solid ${icon} text-slate-500`} />{label}</div>
      <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><span>{value}</span><i className="fa-solid fa-chevron-right" /></div>
    </button>
  );
}

function SettingTitle({ icon, color, title }: { icon: string; color: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <ReminderIcon icon={icon} color={color} size="sm" />
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    </div>
  );
}

function SettingLine({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-11 w-full items-center justify-between text-left text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="flex items-center gap-3 font-black text-slate-800">
        {value ? <span>{value}</span> : null}
        <i className="fa-solid fa-chevron-right text-xs text-slate-500" />
      </span>
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  onPrimaryAction,
  secondaryAction,
  onSecondaryAction,
}: {
  icon: string;
  title: string;
  description: string;
  primaryAction?: string;
  onPrimaryAction?: () => void;
  secondaryAction?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="mt-4 grid min-h-[150px] place-items-center bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-lg text-slate-400 shadow-sm">
          <i className={`fa-solid ${icon}`} />
        </span>
        <p className="mt-3 text-sm font-black text-slate-800">{title}</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
        {primaryAction || secondaryAction ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {primaryAction ? (
              <button type="button" onClick={onPrimaryAction} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-emerald-700">{primaryAction}</button>
            ) : null}
            {secondaryAction ? (
              <button type="button" onClick={onSecondaryAction} className="w-full h-12 rounded-xl border border-emerald-300 text-emerald-700 font-semibold flex items-center justify-center gap-2 bg-white hover:bg-emerald-50">{secondaryAction}</button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

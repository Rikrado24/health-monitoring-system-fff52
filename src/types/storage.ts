export type UserProfileDoc = {
  nama: string;
  email: string;
  username?: string;
  username_lower?: string;
  umur: number;
  jenis_kelamin: string;
  createdAt: string;
  tanggal_lahir?: string;
  golongan_darah?: string;
  no_telepon?: string;
  lokasi?: string;
  tinggi_badan?: number;
  berat_badan?: number;
  updatedAt?: string;
};

export type MeasurementDoc = {
  tinggi_badan: number;
  berat_badan: number;
  bmi?: number;
  detak_jantung: number;
  sistolik: number;
  diastolik: number;
  langkah_kaki: number;
  pola_makan: string;
  tanggal_pengukuran: string;
  sumber_data: "web_manual" | "web_sync" | "esp32_s3" | "app_mobile";
  createdAt: string;
};

export type MeasurementHistoryDoc = MeasurementDoc & {
  id: string;
};

export type DeviceBridgeDoc = {
  uid: string;
  deviceId?: string;
  userCode?: string;
  qrCodeId?: string;
  userName?: string;
  writeKey?: string;
  updatedAt: string;
};

export type DeviceStreamEntryDoc = {
  deviceId: string;
  writeKey: string;
  height: number;
  weight?: number;
  bmi?: number;
  heartRate?: number;
  steps?: number;
  bloodPressure?: string;
  createdAt: string;
  consumedAt?: string;
  consumedByUid?: string;
};

export type DeviceDisplayRequestDoc = {
  deviceId: string;
  userName: string;
  requestedAt: string;
};

export type DevicePresenceDoc = {
  deviceId: string;
  writeKey: string;
  lastSeenAt: string;
  status: string;
  ipAddress?: string;
  userName?: string;
};

export type ActivitySessionDoc = {
  started_at: string;
  finished_at: string;
  duration_sec: number;
  distance_m: number;
  speed_avg_mps: number;
  motion_label: string;
  langkah: number;
  kalori: number;
  source: "gps" | "fallback";
  createdAt: string;
};

export type ReminderDoc = {
  title: string;
  description: string;
  time: string;
  frequency: string;
  category: "Kesehatan" | "Obat" | "Aktivitas" | "Tidur" | "Minum" | "Lainnya";
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HistoryEventDoc = {
  occurredAt: string;
  dataType:
    | "Tekanan Darah"
    | "Detak Jantung"
    | "Berat Badan"
    | "Tinggi Badan"
    | "Pengukuran"
    | "Sinkronisasi Alat"
    | "Aktivitas"
    | "Pola Makan"
    | "Hidrasi"
    | "Tidur";
  value: string;
  category: string;
  status: string;
  note: string;
  actionLabel: string;
  source: string;
  createdAt: string;
};

export type EducationChatMessageDoc = {
  role: "assistant" | "user";
  text: string;
  createdAt: string;
  grounded?: boolean;
  searchQueries?: string[];
  searchEntryPointHtml?: string;
  sources?: Array<{
    title: string;
    uri: string;
    domain?: string;
  }>;
};

export type HealthPredictionDoc = {
  age: number;
  gender: number;
  height_cm: number;
  weight_kg: number;
  bmi: number;
  heart_rate: number;
  systolic_bp: number;
  diastolic_bp: number;
  steps: number;
  predicted_status: number;
  predicted_status_label: string;
  recommendation: string;
  model_name: string;
  model_accuracy: number;
  model_algorithm: string;
  confidence: number;
  created_at: string;
};

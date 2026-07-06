import { equalTo, get, onValue, orderByChild, push, query, ref, remove, set, update } from "firebase/database";
import type { DeviceBridgeDoc, DeviceDisplayRequestDoc, DevicePresenceDoc, DeviceStreamEntryDoc, MeasurementDoc } from "../types/storage";
import { rtdb } from "./firebase";

type SaveMeasurementInput = {
  tinggi_badan: number;
  berat_badan: number;
  bmi?: number;
  detak_jantung: number;
  sistolik: number;
  diastolik: number;
  langkah_kaki: number;
  pola_makan: string;
  tanggal_pengukuran?: string;
  sumber_data: MeasurementDoc["sumber_data"];
};

type MeasurementRow = MeasurementDoc & { id: string };
type DeviceStreamRow = DeviceStreamEntryDoc & { id: string };

const nowIso = () => new Date().toISOString();
const safeText = (value: unknown) => String(value ?? "");
const sortMeasurementRows = (rows: MeasurementRow[], maxRows: number) =>
  rows.sort((a, b) => safeText(b.tanggal_pengukuran).localeCompare(safeText(a.tanggal_pengukuran))).slice(0, maxRows);

export async function saveMeasurementForUser(uid: string, input: SaveMeasurementInput) {
  const payload: MeasurementDoc = {
    tinggi_badan: Number(input.tinggi_badan) || 0,
    berat_badan: Number(input.berat_badan) || 0,
    bmi: Number(input.bmi) > 0 ? Number(input.bmi) : undefined,
    detak_jantung: Number(input.detak_jantung) || 0,
    sistolik: Number(input.sistolik) || 0,
    diastolik: Number(input.diastolik) || 0,
    langkah_kaki: Number(input.langkah_kaki) || 0,
    pola_makan: input.pola_makan?.trim() || "-",
    tanggal_pengukuran: input.tanggal_pengukuran || nowIso(),
    sumber_data: input.sumber_data,
    createdAt: nowIso(),
  };

  const measurementRef = push(ref(rtdb, `users/${uid}/pengukuran`));
  await set(measurementRef, payload);
  return { ok: true as const, id: measurementRef.key || "", payload, message: "" };
}

export async function getMeasurementHistory(uid: string, maxRows = 100) {
  const snapshot = await get(query(ref(rtdb, `users/${uid}/pengukuran`)));
  if (!snapshot.exists()) return [] as MeasurementRow[];

  const rows = Object.entries(snapshot.val() as Record<string, MeasurementDoc>).map(([id, value]) => ({
    id,
    ...value,
  }));

  return sortMeasurementRows(rows, maxRows);
}

export async function clearMeasurementHistoryForUser(uid: string) {
  if (!uid) return { ok: false as const, message: "User belum ditemukan." };
  await remove(ref(rtdb, `users/${uid}/pengukuran`));
  return { ok: true as const, message: "" };
}

export async function updateMeasurementBmiForUser(uid: string, measurementId: string, bmi: number) {
  if (!uid || !measurementId || !(Number(bmi) > 0)) {
    return { ok: false as const, message: "Data BMI belum valid." };
  }

  await update(ref(rtdb, `users/${uid}/pengukuran/${measurementId}`), {
    bmi: Number(bmi.toFixed(1)),
  });
  return { ok: true as const, message: "" };
}

export function subscribeMeasurementHistory(
  uid: string,
  onRows: (rows: MeasurementRow[]) => void,
  onError?: (error: unknown) => void,
  maxRows = 100
) {
  const measurementRef = query(ref(rtdb, `users/${uid}/pengukuran`));
  return onValue(
    measurementRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onRows([]);
        return;
      }

      const rows = Object.entries(snapshot.val() as Record<string, MeasurementDoc>).map(([id, value]) => ({
        id,
        ...value,
      }));
      onRows(sortMeasurementRows(rows, maxRows));
    },
    onError
  );
}

export async function linkDeviceToUser(
  uid: string,
  payload: { deviceId?: string; userCode?: string; qrCodeId?: string; userName?: string; writeKey?: string }
) {
  const codes = [payload.qrCodeId, payload.userCode, payload.deviceId].filter(Boolean) as string[];
  if (codes.length === 0) {
    return { ok: false as const, message: "Kode penghubung alat tidak ditemukan." };
  }

  const bridgeData: DeviceBridgeDoc = {
    uid,
    deviceId: payload.deviceId || "",
    userCode: payload.userCode || "",
    qrCodeId: payload.qrCodeId || "",
    userName: payload.userName || "",
    writeKey: payload.writeKey || "",
    updatedAt: nowIso(),
  };

  try {
    await Promise.all(codes.map((code) => set(ref(rtdb, `device_links/${code}`), bridgeData)));
    return { ok: true as const, codes, message: "" };
  } catch (error) {
    const errorCode = String((error as { code?: string })?.code || "");
    if (errorCode.includes("permission-denied")) {
      return {
        ok: false as const,
        message: "Device ini tidak bisa ditautkan. Bisa jadi masih terhubung ke akun lain atau rules Firebase belum sinkron.",
      };
    }

    return {
      ok: false as const,
      message: "Gagal menyimpan pasangan alat ke Firebase.",
    };
  }
}

export async function publishDeviceDisplayRequest(deviceId: string, userName: string) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) return { ok: false as const, message: "Device ID wajib diisi." };

  const displayName = userName.trim() || "User";
  const payload: DeviceDisplayRequestDoc = {
    deviceId: normalizedDeviceId,
    userName: displayName.slice(0, 32),
    requestedAt: nowIso(),
  };

  await set(ref(rtdb, `device_display/${normalizedDeviceId}`), payload);
  return { ok: true as const, payload, message: "" };
}

export async function getLinkedDeviceForUser(uid: string) {
  const linksSnapshot = await get(query(ref(rtdb, "device_links"), orderByChild("uid"), equalTo(uid)));
  if (!linksSnapshot.exists()) return null;

  const links = linksSnapshot.val() as Record<string, DeviceBridgeDoc>;
  const entry =
    Object.entries(links).find(([key, value]) => value.deviceId && key === value.deviceId) ||
    Object.entries(links).find(([, value]) => Boolean(value.deviceId)) ||
    Object.entries(links)[0];
  if (!entry) return null;

  const [linkCode, value] = entry;
  return {
    linkCode,
    ...value,
  };
}

export async function getDeviceLinkById(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) return null;

  const snapshot = await get(ref(rtdb, `device_links/${normalizedDeviceId}`));
  if (!snapshot.exists()) return null;
  return snapshot.val() as DeviceBridgeDoc;
}

export async function findUidByLinkCode(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const directSnapshot = await get(ref(rtdb, `device_links/${trimmed}`));
  if (directSnapshot.exists()) {
    const data = directSnapshot.val() as DeviceBridgeDoc;
    return data.uid || null;
  }

  const linksSnapshot = await get(query(ref(rtdb, "device_links"), orderByChild("qrCodeId"), equalTo(trimmed)));
  if (!linksSnapshot.exists()) return null;
  const links = linksSnapshot.val() as Record<string, DeviceBridgeDoc>;
  const match = Object.values(links)[0];
  return match?.uid || null;
}

export async function saveEsp32MeasurementByCode(
  code: string,
  input: Omit<SaveMeasurementInput, "sumber_data"> & { sumber_data?: MeasurementDoc["sumber_data"] }
) {
  const uid = await findUidByLinkCode(code);
  if (!uid) return { ok: false as const, message: "UID user belum terhubung dengan kode alat ini." };
  return saveMeasurementForUser(uid, { ...input, sumber_data: input.sumber_data || "esp32_s3" });
}

export async function saveEsp32MeasurementByUid(uid: string, input: Omit<SaveMeasurementInput, "sumber_data">) {
  return saveMeasurementForUser(uid, { ...input, sumber_data: "esp32_s3" });
}

export function subscribeDeviceStream(
  deviceId: string,
  onRows: (rows: DeviceStreamRow[]) => void,
  onError?: (error: unknown) => void
) {
  const streamRef = query(ref(rtdb, `device_stream/${deviceId}`));
  return onValue(
    streamRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onRows([]);
        return;
      }

      const rows = Object.entries(snapshot.val() as Record<string, DeviceStreamEntryDoc>)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => safeText(a.createdAt).localeCompare(safeText(b.createdAt)));
      onRows(rows);
    },
    onError
  );
}

export function subscribeDevicePresence(
  deviceId: string,
  onPresence: (presence: DevicePresenceDoc | null) => void,
  onError?: (error: unknown) => void
) {
  const presenceRef = ref(rtdb, `device_presence/${deviceId}`);
  return onValue(
    presenceRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onPresence(null);
        return;
      }

      onPresence(snapshot.val() as DevicePresenceDoc);
    },
    onError
  );
}

export async function markDeviceStreamEntryConsumed(deviceId: string, entryId: string, uid: string) {
  const currentSnapshot = await get(ref(rtdb, `device_stream/${deviceId}/${entryId}`));
  if (!currentSnapshot.exists()) return;
  const currentValue = currentSnapshot.val() as DeviceStreamEntryDoc;
  await set(ref(rtdb, `device_stream/${deviceId}/${entryId}`), {
    ...currentValue,
    consumedAt: nowIso(),
    consumedByUid: uid,
  });
}

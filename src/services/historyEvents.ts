import { get, onValue, push, query, ref, remove, set } from "firebase/database";
import type { HistoryEventDoc } from "../types/storage";
import { rtdb } from "./firebase";

type HistoryEventInput = Omit<HistoryEventDoc, "createdAt" | "actionLabel"> & {
  actionLabel?: string;
};

type HistoryEventRow = HistoryEventDoc & { id: string };

const nowIso = () => new Date().toISOString();
const safeText = (value: unknown) => String(value ?? "");
const measurementEventTypes = new Set(["Pengukuran", "Sinkronisasi Alat", "Tekanan Darah", "Detak Jantung", "Berat Badan", "Tinggi Badan"]);

export async function createHistoryEventForUser(uid: string, input: HistoryEventInput) {
  const payload: HistoryEventDoc = {
    occurredAt: input.occurredAt || nowIso(),
    dataType: input.dataType,
    value: input.value.trim() || "-",
    category: input.category.trim() || "-",
    status: input.status.trim() || "-",
    note: input.note.trim() || "-",
    actionLabel: input.actionLabel?.trim() || "Lihat",
    source: input.source.trim() || "app",
    createdAt: nowIso(),
  };

  const historyRef = push(ref(rtdb, `users/${uid}/history_events`));
  await set(historyRef, payload);
  return { ok: true as const, id: historyRef.key || "", payload, message: "" };
}

export async function getHistoryEventsForUser(uid: string, maxRows = 200) {
  const snapshot = await get(query(ref(rtdb, `users/${uid}/history_events`)));
  if (!snapshot.exists()) return [] as HistoryEventRow[];

  const rows = Object.entries(snapshot.val() as Record<string, HistoryEventDoc>).map(([id, value]) => ({
    id,
    ...value,
  }));

  return rows
    .sort((a, b) => safeText(b.occurredAt).localeCompare(safeText(a.occurredAt)))
    .slice(0, maxRows);
}

export async function clearMeasurementHistoryEventsForUser(uid: string) {
  if (!uid) return { ok: false as const, message: "User belum ditemukan." };

  const historyRootRef = ref(rtdb, `users/${uid}/history_events`);
  const snapshot = await get(query(historyRootRef));
  if (!snapshot.exists()) {
    return { ok: true as const, message: "" };
  }

  const entries = snapshot.val() as Record<string, HistoryEventDoc>;
  const keptEntries = Object.fromEntries(
    Object.entries(entries).filter(([, value]) => !measurementEventTypes.has(String(value.dataType || "")))
  );

  if (Object.keys(keptEntries).length === 0) {
    await remove(historyRootRef);
  } else {
    await set(historyRootRef, keptEntries);
  }

  return { ok: true as const, message: "" };
}

export function subscribeHistoryEventsForUser(
  uid: string,
  onChange: (rows: Array<HistoryEventDoc & { id: string }>) => void,
  onError?: (error: unknown) => void
) {
  if (!uid) return () => {};

  const historyRef = query(ref(rtdb, `users/${uid}/history_events`));
  return onValue(
    historyRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        return;
      }

      const rows = Object.entries(snapshot.val() as Record<string, HistoryEventDoc>)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => safeText(b.occurredAt).localeCompare(safeText(a.occurredAt)));
      onChange(rows);
    },
    (error) => {
      onError?.(error);
    }
  );
}

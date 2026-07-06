import { get, push, query, ref, set } from "firebase/database";
import type { ActivitySessionDoc } from "../types/storage";
import { rtdb } from "./firebase";

type SaveActivitySessionInput = {
  started_at: string;
  finished_at: string;
  duration_sec: number;
  distance_m: number;
  speed_avg_mps: number;
  motion_label: string;
  langkah: number;
  kalori: number;
  source: ActivitySessionDoc["source"];
};

type ActivityRow = ActivitySessionDoc & { id: string };

const nowIso = () => new Date().toISOString();
const safeText = (value: unknown) => String(value ?? "");

export async function saveActivitySessionForUser(uid: string, input: SaveActivitySessionInput) {
  const payload: ActivitySessionDoc = {
    started_at: input.started_at,
    finished_at: input.finished_at,
    duration_sec: Math.max(0, Number(input.duration_sec) || 0),
    distance_m: Math.max(0, Number(input.distance_m) || 0),
    speed_avg_mps: Math.max(0, Number(input.speed_avg_mps) || 0),
    motion_label: input.motion_label?.trim() || "aktivitas",
    langkah: Math.max(0, Number(input.langkah) || 0),
    kalori: Math.max(0, Number(input.kalori) || 0),
    source: input.source,
    createdAt: nowIso(),
  };

  const sessionRef = push(ref(rtdb, `users/${uid}/activities`));
  await set(sessionRef, payload);
  return { ok: true as const, id: sessionRef.key || "", payload, message: "" };
}

export async function getActivitySessionsForUser(uid: string, maxRows = 100) {
  const snapshot = await get(query(ref(rtdb, `users/${uid}/activities`)));
  if (!snapshot.exists()) return [] as ActivityRow[];

  const rows = Object.entries(snapshot.val() as Record<string, ActivitySessionDoc>).map(([id, value]) => ({
    id,
    ...value,
  }));

  return rows
    .sort((a, b) => safeText(b.finished_at).localeCompare(safeText(a.finished_at)))
    .slice(0, maxRows);
}

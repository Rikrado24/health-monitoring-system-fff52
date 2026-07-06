import { get, onValue, push, query, ref, set } from "firebase/database";
import type { ReminderDoc } from "../types/storage";
import { rtdb } from "./firebase";

type ReminderInput = {
  title: string;
  description: string;
  time: string;
  frequency: string;
  category: ReminderDoc["category"];
  isEnabled?: boolean;
};

type ReminderRow = ReminderDoc & { id: string };

const nowIso = () => new Date().toISOString();

const normalizeReminder = (input: ReminderInput): ReminderDoc => ({
  title: input.title.trim() || "Pengingat Baru",
  description: input.description.trim() || "Tidak ada deskripsi",
  time: input.time || "08:00",
  frequency: input.frequency.trim() || "Setiap hari",
  category: input.category || "Lainnya",
  isEnabled: input.isEnabled ?? true,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

export async function createReminderForUser(uid: string, input: ReminderInput) {
  const payload = normalizeReminder(input);
  const reminderRef = push(ref(rtdb, `users/${uid}/reminders`));
  await set(reminderRef, payload);
  return { ok: true as const, id: reminderRef.key || "", payload, message: "" };
}

export async function updateReminderForUser(uid: string, reminderId: string, input: ReminderInput & { createdAt?: string }) {
  const currentTimestamp = nowIso();
  const payload: ReminderDoc = {
    title: input.title.trim() || "Pengingat Baru",
    description: input.description.trim() || "Tidak ada deskripsi",
    time: input.time || "08:00",
    frequency: input.frequency.trim() || "Setiap hari",
    category: input.category || "Lainnya",
    isEnabled: input.isEnabled ?? true,
    createdAt: input.createdAt || currentTimestamp,
    updatedAt: currentTimestamp,
  };

  await set(ref(rtdb, `users/${uid}/reminders/${reminderId}`), payload);
  return { ok: true as const, payload, message: "" };
}

export function subscribeRemindersForUser(
  uid: string,
  onChange: (rows: Array<ReminderDoc & { id: string }>) => void,
  onError?: (error: unknown) => void
) {
  if (!uid) return () => {};

  const remindersRef = query(ref(rtdb, `users/${uid}/reminders`));
  return onValue(
    remindersRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        return;
      }

      const rows = Object.entries(snapshot.val() as Record<string, ReminderDoc>)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
      onChange(rows);
    },
    (error) => {
      onError?.(error);
    }
  );
}

import { get, onValue, push, ref, set } from "firebase/database";
import type { EducationChatMessageDoc } from "../types/storage";
import { rtdb } from "./firebase";

type EducationChatRow = EducationChatMessageDoc & { id: string };

const EDUCATION_CHAT_PATH = (uid: string) => `users/${uid}/education_chat`;
const LEGACY_DOCTOR_CHAT_PATH = (uid: string) => `users/${uid}/doctor_chat`;

const mapSnapshotToRows = (snapshot: Awaited<ReturnType<typeof get>>) => {
  if (!snapshot.exists()) return [] as EducationChatRow[];
  return Object.entries(snapshot.val() as Record<string, EducationChatMessageDoc>).map(([id, value]) => ({
    id,
    ...value,
  }));
};

export async function createEducationChatMessageForUser(
  uid: string,
  input: EducationChatMessageDoc
) {
  const payload: EducationChatMessageDoc = {
    role: input.role,
    text: input.text.trim() || "-",
    createdAt: input.createdAt || new Date().toISOString(),
  };

  const messageRef = push(ref(rtdb, EDUCATION_CHAT_PATH(uid)));
  await set(messageRef, payload);
  return { ok: true as const, id: messageRef.key || "", payload, message: "" };
}

export async function getEducationChatMessagesForUser(uid: string, maxRows = 100) {
  const [educationSnapshot, legacySnapshot] = await Promise.all([
    get(ref(rtdb, EDUCATION_CHAT_PATH(uid))),
    get(ref(rtdb, LEGACY_DOCTOR_CHAT_PATH(uid))),
  ]);
  const rows = [...mapSnapshotToRows(educationSnapshot), ...mapSnapshotToRows(legacySnapshot)];

  return rows
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .slice(-maxRows);
}

export function subscribeEducationChatMessagesForUser(
  uid: string,
  onChange: (rows: Array<EducationChatMessageDoc & { id: string }>) => void,
  onError?: (error: unknown) => void
) {
  if (!uid) return () => {};

  let educationRows: EducationChatRow[] = [];
  let legacyRows: EducationChatRow[] = [];

  const emit = () => {
    const rows = [...educationRows, ...legacyRows]
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    onChange(rows);
  };

  const handleSnapshot = (snapshot: Awaited<ReturnType<typeof get>>, setRows: (rows: EducationChatRow[]) => void) => {
    setRows(mapSnapshotToRows(snapshot));
    emit();
  };

  const unsubscribeEducation = onValue(
    ref(rtdb, EDUCATION_CHAT_PATH(uid)),
    (snapshot) => handleSnapshot(snapshot as Awaited<ReturnType<typeof get>>, (rows) => {
      educationRows = rows;
    }),
    (error) => {
      onError?.(error);
    }
  );

  const unsubscribeLegacy = onValue(
    ref(rtdb, LEGACY_DOCTOR_CHAT_PATH(uid)),
    (snapshot) => handleSnapshot(snapshot as Awaited<ReturnType<typeof get>>, (rows) => {
      legacyRows = rows;
    }),
    (error) => {
      onError?.(error);
    }
  );

  return () => {
    unsubscribeEducation();
    unsubscribeLegacy();
  };
}

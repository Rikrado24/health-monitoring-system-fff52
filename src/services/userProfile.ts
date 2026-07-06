import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { ref, set } from "firebase/database";
import type { UserProfileDoc } from "../types/storage";
import { db, rtdb } from "./firebase";

const calculateAge = (birthDate: string) => {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return Math.max(0, age);
};

export const buildUserProfileDoc = (input: {
  nama: string;
  email: string;
  username?: string;
  tanggal_lahir: string;
  jenis_kelamin: string;
  golongan_darah?: string;
  no_telepon?: string;
  lokasi?: string;
  tinggi_badan?: number;
  berat_badan?: number;
}): UserProfileDoc => ({
  nama: input.nama.trim(),
  email: input.email.trim(),
  username: input.username?.trim() || "",
  username_lower: input.username?.trim().toLowerCase() || "",
  umur: calculateAge(input.tanggal_lahir),
  jenis_kelamin: input.jenis_kelamin,
  createdAt: new Date().toISOString(),
  tanggal_lahir: input.tanggal_lahir,
  golongan_darah: input.golongan_darah || "",
  no_telepon: input.no_telepon || "",
  lokasi: input.lokasi?.trim() || "",
  tinggi_badan: Number(input.tinggi_badan) || 0,
  berat_badan: Number(input.berat_badan) || 0,
});

export async function saveUserProfile(uid: string, payload: UserProfileDoc) {
  const profileRef = doc(db, "users", uid);
  const currentSnapshot = await getDoc(profileRef);
  const current = currentSnapshot.exists() ? (currentSnapshot.data() as Partial<UserProfileDoc>) : null;
  const nextProfile = {
    ...current,
    ...payload,
    createdAt: current?.createdAt || payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(profileRef, nextProfile, { merge: true });
  await set(ref(rtdb, `users/${uid}/profile`), nextProfile);
  return { ok: true as const };
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  const profile = snapshot.data() as UserProfileDoc;
  await set(ref(rtdb, `users/${uid}/profile`), profile);
  return profile;
}

export function subscribeUserProfile(uid: string, onChange: (profile: UserProfileDoc | null) => void) {
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, "users", uid),
    (snapshot) => {
      const profile = snapshot.exists() ? (snapshot.data() as UserProfileDoc) : null;
      if (profile) void set(ref(rtdb, `users/${uid}/profile`), profile);
      onChange(profile);
    },
    () => {
      onChange(null);
    }
  );
}

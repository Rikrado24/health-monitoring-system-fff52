import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { deleteDoc, doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { buildUserProfileDoc, saveUserProfile } from "./userProfile";
import { auth, db, functions } from "./firebase";

type RegisterInput = {
  fullName: string;
  username: string;
  birthDate: string;
  gender: string;
  bloodType: string;
  email: string;
  phone: string;
  password: string;
};

export type AuthProfile = {
  fullName: string;
  username?: string;
  birthDate?: string;
  gender?: string;
  bloodType?: string;
  phone?: string;
  location?: string;
  height?: string;
  weight?: string;
};

type AuthResult =
  | {
      ok: true;
      uid: string;
      name: string;
      email: string;
      mode?: "firebase";
      requiresVerification?: boolean;
      verificationEmailSent?: boolean;
      verificationErrorMessage?: string;
      profile?: AuthProfile;
    }
  | { ok: false; code: string; message: string };

type SimpleAuthResult = { ok: true; message?: string } | { ok: false; code: string; message: string };
type VerificationEmailResponse = { ok: boolean; provider?: string; alreadyVerified?: boolean };
type CompleteGoogleProfileInput = {
  uid: string;
  email: string;
  fullName: string;
  username: string;
  birthDate: string;
  gender: string;
  bloodType: string;
  phone: string;
  currentUsername?: string;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUsername = (value: string) => value.trim().toLowerCase();
const validateUsername = (value: string) => /^[a-zA-Z0-9._]{4,20}$/.test(value);
let authPersistenceReady: Promise<void> | null = null;

const ensureAuthPersistence = async () => {
  if (!authPersistenceReady) {
    authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {
      // Biarkan login tetap berjalan meski browser menolak persistence eksplisit.
    });
  }
  await authPersistenceReady;
};

const mapAuthError = (code?: string) => {
  if (!code) return "Terjadi kesalahan. Silakan coba lagi.";
  if (code.includes("email-already-in-use")) return "Email sudah terdaftar. Silakan login.";
  if (code.includes("invalid-email")) return "Format email tidak valid.";
  if (code.includes("weak-password")) return "Password terlalu lemah.";
  if (code.includes("operation-not-allowed")) return "Metode Email/Password belum diaktifkan di Firebase Authentication.";
  if (code.includes("configuration-not-found")) return "Konfigurasi Firebase Authentication belum lengkap.";
  if (code.includes("unauthorized-domain")) return "Domain ini belum diizinkan di Firebase Authentication.";
  if (code.includes("invalid-api-key")) return "API key Firebase tidak valid untuk project ini.";
  if (code.includes("network-request-failed")) return "Koneksi jaringan gagal saat menghubungkan ke Firebase.";
  if (code.includes("too-many-requests")) return "Terlalu banyak percobaan. Coba beberapa saat lagi.";
  if (code.includes("popup-closed-by-user")) return "Popup Google ditutup sebelum login selesai.";
  if (code.includes("popup-blocked")) return "Popup Google diblokir browser. Izinkan popup lalu coba lagi.";
  if (code.includes("account-exists-with-different-credential")) return "Email ini sudah terdaftar dengan metode login lain.";
  if (code.includes("permission-denied")) return "Akses Firestore ditolak. Publish Firestore Rules terbaru.";
  if (code.includes("email-not-verified")) return "Email belum diverifikasi. Cek inbox Anda lalu klik link verifikasi.";
  if (code.includes("unauthorized-continue-uri")) return "Domain verifikasi email belum diizinkan di Firebase Authentication.";
  if (code.includes("invalid-continue-uri")) return "URL verifikasi email tidak valid.";
  if (code.includes("missing-continue-uri")) return "URL verifikasi email belum disetel.";
  if (code.includes("failed-precondition")) return "Layanan email verifikasi custom belum selesai disetel. Isi secret Resend dan alamat pengirim terlebih dahulu.";
  if (code.includes("unauthenticated")) return "Sesi login tidak valid saat mengirim email verifikasi. Coba lagi.";
  if (code.includes("unavailable")) return "Layanan email verifikasi sedang tidak tersedia. Coba lagi beberapa saat.";
  if (code.includes("not-found")) return "Fungsi email verifikasi custom belum dideploy ke Firebase.";
  if (code.includes("internal")) return "Gagal mengirim email verifikasi custom. Periksa konfigurasi Resend dan domain pengirim.";
  if (code.includes("user-not-found")) return "Akun tidak ditemukan.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Email atau password salah.";
  return `Gagal memproses autentikasi (${code}).`;
};

const sendVerificationToUser = async (user: User) => {
  if (user.emailVerified) return true;
  try {
    const sendCustomVerificationEmail = httpsCallable<{ displayName?: string }, VerificationEmailResponse>(
      functions,
      "sendCustomVerificationEmail"
    );
    await sendCustomVerificationEmail({
      displayName: user.displayName || "",
    });
  } catch (error) {
    const code = (error as { code?: string })?.code || "";
    if (
      code.includes("failed-precondition") ||
      code.includes("not-found") ||
      code.includes("unavailable") ||
      code.includes("internal")
    ) {
      await sendEmailVerification(user, {
        url: "https://health-monitoring-system-fff52.web.app",
        handleCodeInApp: false,
      });
    } else {
      throw error;
    }
  }
  return true;
};

const buildProfileDraft = (fallbackName: string, profile?: AuthProfile): AuthProfile => ({
  fullName: profile?.fullName || fallbackName,
  username: profile?.username || "",
  birthDate: profile?.birthDate || "",
  gender: profile?.gender || "",
  bloodType: profile?.bloodType || "",
  phone: profile?.phone || "",
  location: profile?.location || "",
  height: profile?.height || "",
  weight: profile?.weight || "",
});

export const isProfileComplete = (profile?: AuthProfile | null) =>
  Boolean(
    profile?.fullName?.trim() &&
      profile?.username?.trim() &&
      profile?.birthDate &&
      profile?.gender &&
      profile?.bloodType &&
      profile?.phone?.trim()
  );

async function reserveUsernameIfNeeded(uid: string, usernameRaw?: string, emailRaw?: string) {
  if (!usernameRaw) return { ok: true as const, username: "", usernameLower: "" };
  const username = usernameRaw.trim();
  if (!username) return { ok: true as const, username: "", usernameLower: "" };
  const usernameLower = normalizeUsername(username);

  if (!validateUsername(username)) {
    return { ok: false as const, message: "Username harus 4-20 karakter (huruf/angka/titik/underscore)." };
  }

  try {
    await runTransaction(db, async (tx) => {
      const mapRef = doc(db, "usernames", usernameLower);
      const mapSnap = await tx.get(mapRef);
      if (mapSnap.exists()) {
        const owner = String(mapSnap.data()?.uid || "");
        if (owner && owner !== uid) {
          throw new Error("USERNAME_TAKEN");
        }
      }
      tx.set(
        mapRef,
        {
          uid,
          email: normalizeEmail(emailRaw || ""),
          username,
          username_lower: usernameLower,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
    return { ok: true as const, username, usernameLower };
  } catch (error) {
    if ((error as Error).message === "USERNAME_TAKEN") {
      return { ok: false as const, message: "Username sudah dipakai. Gunakan username lain." };
    }
    return { ok: false as const, message: "Gagal menyimpan username. Publish Firestore Rules terbaru lalu coba lagi." };
  }
}

async function resolveLoginEmail(identifier: string) {
  const cleaned = identifier.trim();
  if (!cleaned) return "";
  if (cleaned.includes("@")) return normalizeEmail(cleaned);

  const usernameLower = normalizeUsername(cleaned);
  try {
    const mapSnap = await getDoc(doc(db, "usernames", usernameLower));
    return String(mapSnap.data()?.email || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

async function getAuthProfile(uid: string, fallbackName: string): Promise<AuthProfile | undefined> {
  try {
    const profileSnapshot = await getDoc(doc(db, "users", uid));
    if (!profileSnapshot.exists()) return undefined;
    const profileDoc = profileSnapshot.data() as {
      nama?: string;
      username?: string;
      username_lower?: string;
      tanggal_lahir?: string;
      jenis_kelamin?: string;
      golongan_darah?: string;
      no_telepon?: string;
      lokasi?: string;
      tinggi_badan?: number;
      berat_badan?: number;
    };
    return {
      fullName: (profileDoc.nama || fallbackName || "User").trim(),
      username: profileDoc.username || profileDoc.username_lower || "",
      birthDate: profileDoc.tanggal_lahir || "",
      gender: profileDoc.jenis_kelamin || "",
      bloodType: profileDoc.golongan_darah || "",
      phone: profileDoc.no_telepon || "",
      location: profileDoc.lokasi || "",
      height: Number(profileDoc.tinggi_badan) > 0 ? String(profileDoc.tinggi_badan) : "",
      weight: Number(profileDoc.berat_badan) > 0 ? String(profileDoc.berat_badan) : "",
    };
  } catch {
    return undefined;
  }
}

export async function loadAuthProfile(uid: string, fallbackName: string): Promise<AuthProfile | undefined> {
  return getAuthProfile(uid, fallbackName);
}

export function createProfileDraft(fallbackName: string, profile?: AuthProfile): AuthProfile {
  return buildProfileDraft(fallbackName, profile);
}

async function buildSignedInResult(uid: string, fallbackName: string, fallbackEmail: string): Promise<AuthResult> {
  const profile = await getAuthProfile(uid, fallbackName);
  return {
    ok: true,
    uid,
    name: profile?.fullName || fallbackName,
    email: fallbackEmail,
    mode: "firebase",
    requiresVerification: false,
    profile,
  };
}

export async function registerWithEmail(input: RegisterInput): Promise<AuthResult> {
  const username = input.username.trim();
  if (!validateUsername(username)) {
    return { ok: false, code: "invalid-username", message: "Username harus 4-20 karakter (huruf/angka/titik/underscore)." };
  }

  try {
    await ensureAuthPersistence();
    const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    await updateProfile(credential.user, { displayName: input.fullName.trim() });

    const reserveResult = await reserveUsernameIfNeeded(credential.user.uid, username, input.email);
    if (!reserveResult.ok) {
      try {
        await deleteUser(credential.user);
      } catch {
        await signOut(auth);
      }
      return { ok: false, code: "username_reserve_failed", message: reserveResult.message };
    }

    const profileDoc = buildUserProfileDoc({
        nama: input.fullName,
        email: input.email,
        username,
        tanggal_lahir: input.birthDate,
        jenis_kelamin: input.gender,
        golongan_darah: input.bloodType,
        no_telepon: input.phone,
        lokasi: "",
        tinggi_badan: 0,
        berat_badan: 0,
      });
    try {
      await saveUserProfile(credential.user.uid, profileDoc);
    } catch (profileError) {
      try {
        await deleteUser(credential.user);
      } catch {
        await signOut(auth);
      }
      const code = (profileError as { code?: string })?.code || "profile_save_failed";
      return {
        ok: false,
        code,
        message: code.includes("permission-denied")
          ? "Pendaftaran gagal karena profil ditolak Firestore/Realtime Database. Deploy rules terbaru lalu coba daftar lagi."
          : "Pendaftaran gagal karena data profil belum bisa disimpan ke Firebase.",
      };
    }

    let verificationEmailSent = true;
    let verificationErrorMessage = "";
    try {
      await sendVerificationToUser(credential.user);
    } catch (verificationError) {
      verificationEmailSent = false;
      verificationErrorMessage = mapAuthError((verificationError as { code?: string })?.code);
    }

    await signOut(auth);

    return {
      ok: true,
      uid: credential.user.uid,
      name: input.fullName.trim(),
      email: normalizeEmail(input.email),
      mode: "firebase",
      requiresVerification: true,
      verificationEmailSent,
      verificationErrorMessage,
      profile: {
        fullName: input.fullName.trim(),
        username,
        birthDate: input.birthDate,
        gender: input.gender,
        bloodType: input.bloodType,
        phone: input.phone,
      },
    };
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    const code = typed.code;
    return {
      ok: false,
      code: code || "register_failed",
      message: code ? mapAuthError(code) : typed.message || "Gagal memproses autentikasi.",
    };
  }
}

export async function loginWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    await ensureAuthPersistence();
    const resolvedEmail = await resolveLoginEmail(email);
    if (!resolvedEmail) {
      return { ok: false, code: "user-not-found", message: "Akun tidak ditemukan. Periksa username/email Anda." };
    }

    const credential = await signInWithEmailAndPassword(auth, resolvedEmail, password);
    if (!credential.user.emailVerified) {
      let verificationErrorMessage = "";
      try {
        await sendVerificationToUser(credential.user);
      } catch (verificationError) {
        const code = (verificationError as { code?: string })?.code;
        verificationErrorMessage = ` Kirim ulang otomatis gagal: ${mapAuthError(code)}.`;
      }
      await signOut(auth);
      return {
        ok: false,
        code: "email-not-verified",
        message: `Email belum diverifikasi. Kami sudah mencoba kirim ulang link verifikasi ke inbox Anda.${verificationErrorMessage}`,
      };
    }

    try {
      await setDoc(
        doc(db, "users", credential.user.uid),
        {
          nama: credential.user.displayName || resolvedEmail.split("@")[0] || "User",
          email: credential.user.email || resolvedEmail,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      // Jangan blok login jika sinkronisasi Firestore belum siap.
    }

    const fallbackName = credential.user.displayName || resolvedEmail.split("@")[0] || "User";
    return buildSignedInResult(credential.user.uid, fallbackName, credential.user.email || resolvedEmail);
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    const code = typed.code;
    return {
      ok: false,
      code: code || "login_failed",
      message: code ? mapAuthError(code) : typed.message || "Gagal memproses autentikasi.",
    };
  }
}

export async function resendVerificationEmail(email: string, password: string): Promise<SimpleAuthResult> {
  try {
    await ensureAuthPersistence();
    const resolvedEmail = await resolveLoginEmail(email);
    if (!resolvedEmail) {
      return { ok: false, code: "user-not-found", message: "Akun tidak ditemukan. Periksa username/email Anda." };
    }
    const credential = await signInWithEmailAndPassword(auth, resolvedEmail, password);
    try {
      if (credential.user.emailVerified) {
        return { ok: true, message: "Email sudah diverifikasi. Silakan masuk." };
      }
      await sendVerificationToUser(credential.user);
      return { ok: true, message: `Link verifikasi dikirim ulang ke ${credential.user.email || resolvedEmail}.` };
    } finally {
      await signOut(auth);
    }
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    const code = typed.code;
    return {
      ok: false,
      code: code || "verification_resend_failed",
      message: code ? mapAuthError(code) : typed.message || "Gagal mengirim ulang verifikasi.",
    };
  }
}

export async function confirmEmailVerification(email: string, password: string): Promise<AuthResult> {
  try {
    await ensureAuthPersistence();
    const resolvedEmail = await resolveLoginEmail(email);
    if (!resolvedEmail) {
      return { ok: false, code: "user-not-found", message: "Akun tidak ditemukan. Periksa username/email Anda." };
    }
    const credential = await signInWithEmailAndPassword(auth, resolvedEmail, password);
    await credential.user.reload();
    const refreshedUser = auth.currentUser || credential.user;

    if (!refreshedUser.emailVerified) {
      try {
        await sendVerificationToUser(refreshedUser);
      } catch {
        // Jika kirim ulang gagal, tetap tampilkan status belum verified.
      }
      await signOut(auth);
      return {
        ok: false,
        code: "email-not-verified",
        message: "Email masih belum terverifikasi. Klik link di inbox email Anda, lalu coba lagi.",
      };
    }

    const fallbackName = refreshedUser.displayName || resolvedEmail.split("@")[0] || "User";
    return buildSignedInResult(refreshedUser.uid, fallbackName, refreshedUser.email || resolvedEmail);
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    const code = typed.code;
    return {
      ok: false,
      code: code || "verification_confirm_failed",
      message: code ? mapAuthError(code) : typed.message || "Gagal mengecek verifikasi email.",
    };
  }
}

export async function loginWithGoogle(): Promise<AuthResult> {
  try {
    await ensureAuthPersistence();
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    const user = credential.user;
    const fallbackName = user.displayName || user.email?.split("@")[0] || "User";
    let profile = await getAuthProfile(user.uid, fallbackName);

    if (!profile) {
      try {
        await saveUserProfile(
          user.uid,
          buildUserProfileDoc({
            nama: fallbackName,
            email: user.email || "",
            tanggal_lahir: "",
            jenis_kelamin: "",
            golongan_darah: "",
            no_telepon: "",
            lokasi: "",
            tinggi_badan: 0,
            berat_badan: 0,
          })
        );
        profile = await getAuthProfile(user.uid, fallbackName);
      } catch {
        // Tidak blok login Google jika Firestore belum siap.
      }
    }

    return {
      ok: true,
      uid: user.uid,
      name: profile?.fullName || fallbackName,
      email: user.email || "",
      mode: "firebase",
      requiresVerification: false,
      profile,
    };
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    const code = typed.code;
    return {
      ok: false,
      code: code || "google_login_failed",
      message: code ? mapAuthError(code) : typed.message || "Login Google gagal.",
    };
  }
}

export async function completeGoogleProfile(input: CompleteGoogleProfileInput): Promise<AuthResult> {
  const username = input.username.trim();
  const fullName = input.fullName.trim();

  if (!input.uid) {
    return { ok: false, code: "missing-uid", message: "Sesi login Google tidak ditemukan. Silakan login ulang." };
  }
  if (!fullName) {
    return { ok: false, code: "missing-full-name", message: "Nama lengkap wajib diisi." };
  }
  if (!validateUsername(username)) {
    return { ok: false, code: "invalid-username", message: "Username harus 4-20 karakter (huruf/angka/titik/underscore)." };
  }
  if (!input.birthDate) {
    return { ok: false, code: "missing-birth-date", message: "Tanggal lahir wajib diisi." };
  }
  if (!input.gender) {
    return { ok: false, code: "missing-gender", message: "Jenis kelamin wajib dipilih." };
  }
  if (!input.bloodType) {
    return { ok: false, code: "missing-blood-type", message: "Golongan darah wajib dipilih." };
  }
  if (!input.phone.trim()) {
    return { ok: false, code: "missing-phone", message: "Nomor telepon wajib diisi." };
  }

  const reserveResult = await reserveUsernameIfNeeded(input.uid, username, input.email);
  if (!reserveResult.ok) {
    return { ok: false, code: "username_reserve_failed", message: reserveResult.message };
  }

  const previousUsernameLower = normalizeUsername(input.currentUsername || "");
  if (previousUsernameLower && previousUsernameLower !== reserveResult.usernameLower) {
    try {
      const previousMapRef = doc(db, "usernames", previousUsernameLower);
      const previousMapSnap = await getDoc(previousMapRef);
      if (previousMapSnap.exists() && String(previousMapSnap.data()?.uid || "") === input.uid) {
        await deleteDoc(previousMapRef);
      }
    } catch {
      // Biarkan proses lanjut jika cleanup mapping lama gagal.
    }
  }

  try {
    await saveUserProfile(
      input.uid,
      buildUserProfileDoc({
        nama: fullName,
        email: input.email,
        username: reserveResult.username,
        tanggal_lahir: input.birthDate,
        jenis_kelamin: input.gender,
        golongan_darah: input.bloodType,
        no_telepon: input.phone,
        lokasi: "",
        tinggi_badan: 0,
        berat_badan: 0,
      })
    );

    if (auth.currentUser?.uid === input.uid) {
      await updateProfile(auth.currentUser, { displayName: fullName });
    }

    return buildSignedInResult(input.uid, fullName, normalizeEmail(input.email));
  } catch (error) {
    const code = (error as { code?: string })?.code || "profile_save_failed";
    return {
      ok: false,
      code,
      message: code.includes("permission-denied")
        ? "Profil belum bisa disimpan ke Firebase. Publish rules terbaru lalu coba lagi."
        : "Gagal menyimpan profil. Coba lagi beberapa saat.",
    };
  }
}

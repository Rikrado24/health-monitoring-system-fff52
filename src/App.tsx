import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import LoginPage from "./components/LoginPage";
import { auth } from "./services/firebase";
import { createProfileDraft, isProfileComplete, loadAuthProfile, type AuthProfile } from "./services/auth";

const Dashboard = lazy(() => import("./components/Dashboard"));
const ProfileSetupPage = lazy(() => import("./components/ProfileSetupPage"));

const profileStorageKey = (uid: string, email: string) => `sehatai-profile:${uid || email.trim().toLowerCase() || "guest"}`;

const readStoredItem = (key: string, fallback = "") => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const writeStoredItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Abaikan jika storage diblokir browser.
  }
};

const removeStoredItem = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Abaikan jika storage diblokir browser.
  }
};

const clearStoredSession = () => {
  removeStoredItem("sehatai_logged_in");
  removeStoredItem("sehatai_user_uid");
  removeStoredItem("sehatai_user_name");
  removeStoredItem("sehatai_user_email");
};

const persistAuthProfile = ({
  uid,
  name,
  email,
  profile,
}: {
  uid?: string;
  name: string;
  email: string;
  profile?: AuthProfile;
}) => {
  const key = profileStorageKey(uid || "", email);
  const existing = (() => {
    try {
      return JSON.parse(readStoredItem(key, "{}")) as Record<string, string>;
    } catch {
      return {};
    }
  })();

  writeStoredItem(
    key,
    JSON.stringify({
      ...existing,
      fullName: profile?.fullName || name,
      username: profile?.username || existing.username || "",
      email: email || existing.email || "",
      phone: profile?.phone || existing.phone || "",
      gender: profile?.gender || existing.gender || "",
      age: existing.age || "",
      birthDate: profile?.birthDate || existing.birthDate || "",
      bloodType: profile?.bloodType || existing.bloodType || "",
      location: profile?.location || existing.location || "",
      height: profile?.height || existing.height || "",
      weight: profile?.weight || existing.weight || "",
    })
  );
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUid, setCurrentUid] = useState("");
  const [currentName, setCurrentName] = useState(() => readStoredItem("sehatai_user_name", "Pengguna") || "Pengguna");
  const [currentEmail, setCurrentEmail] = useState(() => readStoredItem("sehatai_user_email"));
  const [currentProfile, setCurrentProfile] = useState<AuthProfile | undefined>(undefined);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const authFallbackTimerRef = useRef<number | null>(null);
  const lazyFallback = (
    <main className="app-mobile min-h-screen bg-[#F8FAF7] px-4 py-5 pb-24">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center rounded-[22px] border border-[#ead6aa] bg-white/80 p-6 text-center shadow-[0_25px_70px_-28px_rgba(117,80,19,0.35)]">
        <div>
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <i className="fa-solid fa-spinner fa-spin text-2xl" />
          </div>
          <p className="text-base font-bold text-slate-800">Memuat halaman...</p>
          <p className="mt-1 text-sm text-slate-500">Mohon tunggu sebentar.</p>
        </div>
      </div>
    </main>
  );

  useEffect(() => {
    let logoutGuardTimer: number | null = null;
    let settled = false;

    const applySignedInState = async ({
      uid,
      fallbackName,
      email,
      profile,
    }: {
      uid: string;
      fallbackName: string;
      email: string;
      profile?: AuthProfile;
    }) => {
      const hydratedProfile = profile || (await loadAuthProfile(uid, fallbackName));
      const nextProfile = createProfileDraft(fallbackName, hydratedProfile);
      const nextName = nextProfile.fullName || fallbackName;

      setLoggedIn(true);
      setCurrentUid(uid);
      setCurrentName(nextName);
      setCurrentEmail(email);
      setCurrentProfile(nextProfile);
      setNeedsProfileSetup(!isProfileComplete(nextProfile));
      writeStoredItem("sehatai_logged_in", "1");
      writeStoredItem("sehatai_user_uid", uid);
      writeStoredItem("sehatai_user_name", nextName);
      writeStoredItem("sehatai_user_email", email);
      persistAuthProfile({ uid, name: nextName, email, profile: nextProfile });
      finalizeAuthBoot();
    };

    const finalizeAuthBoot = () => {
      if (settled) return;
      settled = true;
      setAuthReady(true);
    };

    authFallbackTimerRef.current = window.setTimeout(() => {
      if (settled) return;
      const currentUser = auth.currentUser;
      if (currentUser && (!currentUser.email || currentUser.emailVerified)) {
        void applySignedInUser(currentUser);
        return;
      }

      setLoggedIn(false);
      setCurrentUid("");
      setCurrentName("Pengguna");
      setCurrentEmail("");
      setCurrentProfile(undefined);
      setNeedsProfileSetup(false);
      clearStoredSession();
      finalizeAuthBoot();
    }, 5000);

    const applySignedInUser = async (user: User) => {
      if (user.email && !user.emailVerified) {
        setLoggedIn(false);
        setCurrentUid("");
        setCurrentName("Pengguna");
        setCurrentEmail("");
        setCurrentProfile(undefined);
        setNeedsProfileSetup(false);
        clearStoredSession();
        void signOut(auth);
        finalizeAuthBoot();
        return;
      }

      const nextName = user.displayName || readStoredItem("sehatai_user_name", "User") || "User";
      const nextEmail = user.email || readStoredItem("sehatai_user_email");
      await applySignedInState({
        uid: user.uid,
        fallbackName: nextName,
        email: nextEmail,
      });
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (logoutGuardTimer) {
        window.clearTimeout(logoutGuardTimer);
        logoutGuardTimer = null;
      }

      if (!user) {
        logoutGuardTimer = window.setTimeout(() => {
          const currentUser = auth.currentUser;
          if (currentUser) {
            void applySignedInUser(currentUser);
            return;
          }
          setLoggedIn(false);
          setCurrentUid("");
          setCurrentName("Pengguna");
          setCurrentEmail("");
          setCurrentProfile(undefined);
          setNeedsProfileSetup(false);
          clearStoredSession();
          finalizeAuthBoot();
        }, 900);
        return;
      }

      void applySignedInUser(user);
    });

    return () => {
      if (logoutGuardTimer) window.clearTimeout(logoutGuardTimer);
      if (authFallbackTimerRef.current) window.clearTimeout(authFallbackTimerRef.current);
      unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <main className="app-mobile min-h-screen bg-[#F8FAF7] px-4 py-5 pb-24">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center rounded-[22px] border border-[#ead6aa] bg-white/80 p-6 text-center shadow-[0_25px_70px_-28px_rgba(117,80,19,0.35)]">
          <div>
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <i className="fa-solid fa-spinner fa-spin text-2xl" />
            </div>
            <p className="text-base font-bold text-slate-800">Memeriksa sesi login Anda...</p>
            <p className="mt-1 text-sm text-slate-500">Mohon tunggu sebentar.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <LoginPage
        onLoginSuccess={({ uid, name, email, profile }) => {
          if (!uid) return;
          const nextProfile = createProfileDraft(name, profile);
          setLoggedIn(true);
          setCurrentUid(uid);
          setCurrentName(nextProfile.fullName || name);
          setCurrentEmail(email);
          setCurrentProfile(nextProfile);
          setNeedsProfileSetup(!isProfileComplete(nextProfile));
          writeStoredItem("sehatai_user_name", nextProfile.fullName || name);
          writeStoredItem("sehatai_user_email", email);
          writeStoredItem("sehatai_user_uid", uid);
          persistAuthProfile({ uid, name: nextProfile.fullName || name, email, profile: nextProfile });
        }}
      />
    );
  }

  if (needsProfileSetup) {
    return (
      <Suspense fallback={lazyFallback}>
        <ProfileSetupPage
          uid={currentUid}
          email={currentEmail}
          initialName={currentName}
          initialProfile={currentProfile}
          onComplete={({ uid, name, email, profile }) => {
            const nextProfile = createProfileDraft(name, profile);
            setCurrentUid(uid);
            setCurrentName(nextProfile.fullName || name);
            setCurrentEmail(email);
            setCurrentProfile(nextProfile);
            setNeedsProfileSetup(false);
            persistAuthProfile({ uid, name: nextProfile.fullName || name, email, profile: nextProfile });
          }}
          onSignOut={async () => {
            await signOut(auth);
            setLoggedIn(false);
            setCurrentUid("");
            setCurrentName("Pengguna");
            setCurrentEmail("");
            setCurrentProfile(undefined);
            setNeedsProfileSetup(false);
            clearStoredSession();
          }}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={lazyFallback}>
      <Dashboard
        latest={null}
        userDisplayName={currentName || currentEmail || ""}
        userUid={currentUid}
        userEmail={currentEmail}
        onSignOut={async () => {
          await signOut(auth);
          setLoggedIn(false);
          setCurrentUid("");
          setCurrentName("Pengguna");
          setCurrentEmail("");
          setCurrentProfile(undefined);
          setNeedsProfileSetup(false);
          clearStoredSession();
        }}
      />
    </Suspense>
  );
}

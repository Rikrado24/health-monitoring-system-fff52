import { useMemo, useState } from "react";
import { completeGoogleProfile, type AuthProfile } from "../services/auth";

type ProfileSetupPageProps = {
  uid: string;
  email: string;
  initialName: string;
  initialProfile?: AuthProfile;
  onComplete: (payload: {
    uid: string;
    name: string;
    email: string;
    profile?: AuthProfile;
  }) => void;
  onSignOut: () => Promise<void>;
};

export default function ProfileSetupPage({
  uid,
  email,
  initialName,
  initialProfile,
  onComplete,
  onSignOut,
}: ProfileSetupPageProps) {
  const [fullName, setFullName] = useState(initialProfile?.fullName || initialName);
  const [username, setUsername] = useState(initialProfile?.username || "");
  const [birthDate, setBirthDate] = useState(initialProfile?.birthDate || "");
  const [gender, setGender] = useState(initialProfile?.gender || "");
  const [bloodType, setBloodType] = useState(initialProfile?.bloodType || "");
  const [phone, setPhone] = useState(initialProfile?.phone || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const usernamePattern = /^[a-zA-Z0-9._]{4,20}$/;
  const completionScore = useMemo(() => {
    const fields = [fullName.trim(), username.trim(), birthDate, gender, bloodType, phone.trim()];
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
  }, [birthDate, bloodType, fullName, gender, phone, username]);
  const missingItems = useMemo(
    () =>
      [
        !fullName.trim() ? "Nama lengkap" : "",
        !username.trim() ? "Username" : "",
        !birthDate ? "Tanggal lahir" : "",
        !gender ? "Jenis kelamin" : "",
        !bloodType ? "Golongan darah" : "",
        !phone.trim() ? "Nomor telepon" : "",
      ].filter(Boolean),
    [birthDate, bloodType, fullName, gender, phone, username]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!fullName.trim()) {
      setMessage({ tone: "error", text: "Nama lengkap wajib diisi." });
      return;
    }
    if (!usernamePattern.test(username.trim())) {
      setMessage({ tone: "error", text: "Username 4-20 karakter (huruf/angka/titik/underscore)." });
      return;
    }
    if (!birthDate) {
      setMessage({ tone: "error", text: "Tanggal lahir wajib diisi." });
      return;
    }
    if (!gender) {
      setMessage({ tone: "error", text: "Jenis kelamin wajib dipilih." });
      return;
    }
    if (!bloodType) {
      setMessage({ tone: "error", text: "Golongan darah wajib dipilih." });
      return;
    }
    if (!phone.trim()) {
      setMessage({ tone: "error", text: "Nomor telepon wajib diisi." });
      return;
    }

    setIsSubmitting(true);
    const result = await completeGoogleProfile({
      uid,
      email,
      fullName,
      username,
      birthDate,
      gender,
      bloodType,
      phone,
      currentUsername: initialProfile?.username || "",
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setMessage(null);
    onComplete({
      uid: result.uid,
      name: result.name,
      email: result.email,
      profile: result.profile,
    });
  };

  return (
    <main className="app-mobile min-h-screen bg-[radial-gradient(circle_at_top,#f3fbf6_0%,#f8faf7_32%,#eef4ef_100%)] px-4 py-4 pb-24 md:px-5 md:py-5">
      <div className="mx-auto w-full max-w-md md:max-w-[1060px] lg:max-w-[1180px]">
        <section className="overflow-hidden rounded-[30px] border border-[#dbe7df] bg-white shadow-[0_36px_95px_-44px_rgba(17,56,38,0.34)] lg:grid lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="relative overflow-hidden border-b border-[#e6efe9] bg-[linear-gradient(165deg,#0b4d3d_0%,#146b54_34%,#1f8a67_58%,#d9f1df_138%)] p-5 text-white lg:min-h-[700px] lg:border-b-0 lg:border-r lg:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(243,213,139,0.18),transparent_28%)]" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-50 backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-[#f3d58b]" />
                Tahap 2
              </div>
              <h1 className="mt-5 max-w-[360px] text-[26px] font-black leading-[1.08] lg:text-[36px]">
                Lengkapi profil sebelum kita buka dashboard.
              </h1>
              <p className="mt-4 max-w-[360px] text-[14px] leading-7 text-emerald-50/90">
                Login Google sudah berhasil. Sekarang kita isi data dasar sekali saja supaya semua pengukuran dan riwayat
                langsung terikat ke akun Anda dengan rapi.
              </p>

              <div className="mt-6 rounded-[26px] border border-white/18 bg-white/10 p-4 backdrop-blur md:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">Progres profil</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-50/80">Semakin lengkap, semakin cepat masuk dashboard.</p>
                  </div>
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/14 text-lg font-black text-white">
                    {completionScore}%
                  </div>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#f3d58b_0%,#fff0c8_55%,#ffffff_100%)] transition-all"
                    style={{ width: `${completionScore}%` }}
                  />
                </div>
                <p className="mt-3 text-sm font-semibold text-emerald-50">
                  {missingItems.length === 0 ? "Semua data inti sudah lengkap." : `${missingItems.length} data inti masih perlu diisi.`}
                </p>
              </div>

              <div className="mt-6 grid gap-3">
                {[
                  "Username dipakai sebagai identitas akun di aplikasi.",
                  "Tanggal lahir membantu hitung umur otomatis.",
                  "Nomor telepon memudahkan profil Anda tetap konsisten.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/90">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20 text-xs font-black">
                      +
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[24px] border border-white/12 bg-[#072f25]/20 p-4 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">Yang belum lengkap</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(missingItems.length ? missingItems : ["Siap masuk dashboard"]).map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <section className="bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfb_100%)] p-4 md:p-6 lg:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#1f7a5c]">Profil Awal</p>
                <h2 className="mt-2 text-[24px] font-black leading-tight text-slate-900 md:text-[28px] lg:text-[30px]">Data dasar akun Anda</h2>
                <p className="mt-2 max-w-[560px] text-sm leading-6 text-slate-500">
                  Email Google Anda sudah masuk sebagai akun utama. Tinggal isi data berikut lalu kita masuk ke dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
              >
                Ganti akun
              </button>
            </div>

            <div className="mt-6 rounded-[24px] border border-[#e2ece5] bg-[linear-gradient(135deg,#f7fbf8_0%,#eef7f1_100%)] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Akun Google aktif</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{email}</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#1f7a5c] shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Siap dilengkapi
                </div>
              </div>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="rounded-[26px] border border-[#e5ede7] bg-white p-4 shadow-[0_20px_35px_-34px_rgba(15,23,42,0.32)] md:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#ecf7f0] text-[#1f7a5c]">
                    <i className="fa-solid fa-id-card" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Identitas akun</p>
                    <p className="text-xs leading-5 text-slate-500">Nama dan username utama Anda di aplikasi.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Nama Lengkap</span>
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8e4dc] bg-[#fbfdfb] px-4 py-3.5 text-[15px] text-slate-700 outline-none transition focus:border-[#1f7a5c] focus:bg-white"
                      placeholder="Nama lengkap Anda"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Username</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8e4dc] bg-[#fbfdfb] px-4 py-3.5 text-[15px] text-slate-700 outline-none transition focus:border-[#1f7a5c] focus:bg-white"
                      placeholder="Nama pengguna Anda"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[26px] border border-[#e5ede7] bg-white p-4 shadow-[0_20px_35px_-34px_rgba(15,23,42,0.32)] md:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#fff6e2] text-[#b07b24]">
                    <i className="fa-solid fa-heart-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Informasi dasar kesehatan</p>
                    <p className="text-xs leading-5 text-slate-500">Dipakai untuk konteks awal dashboard dan riwayat Anda.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Tanggal Lahir</span>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(event) => setBirthDate(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8e4dc] bg-[#fbfdfb] px-4 py-3.5 text-[15px] text-slate-700 outline-none transition focus:border-[#1f7a5c] focus:bg-white"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Nomor Telepon</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8e4dc] bg-[#fbfdfb] px-4 py-3.5 text-[15px] text-slate-700 outline-none transition focus:border-[#1f7a5c] focus:bg-white"
                      placeholder="Nomor HP aktif"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Jenis Kelamin</span>
                    <select
                      value={gender}
                      onChange={(event) => setGender(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8e4dc] bg-[#fbfdfb] px-4 py-3.5 text-[15px] text-slate-700 outline-none transition focus:border-[#1f7a5c] focus:bg-white"
                    >
                      <option value="">Pilih jenis kelamin</option>
                      <option value="Pria">Pria</option>
                      <option value="Wanita">Wanita</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Golongan Darah</span>
                    <select
                      value={bloodType}
                      onChange={(event) => setBloodType(event.target.value)}
                      className="w-full rounded-2xl border border-[#d8e4dc] bg-[#fbfdfb] px-4 py-3.5 text-[15px] text-slate-700 outline-none transition focus:border-[#1f7a5c] focus:bg-white"
                    >
                      <option value="">Pilih golongan darah</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="AB">AB</option>
                      <option value="O">O</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#e7eee9] bg-[linear-gradient(135deg,#fbfcfb_0%,#f3f8f5_100%)] px-4 py-4 text-sm leading-7 text-slate-500">
                Setelah profil ini selesai, akun Google Anda akan langsung dipakai untuk semua data pengukuran, riwayat,
                edukasi, dan sinkronisasi alat. Anda tidak perlu mengulang pengisian ini lagi.
              </div>

              {message ? (
                <p
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm ${
                    message.tone === "error" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-700"
                  }`}
                >
                  {message.text}
                </p>
              ) : null}

              <div className="rounded-[26px] border border-[#e3ebe5] bg-white p-3 shadow-[0_22px_42px_-36px_rgba(15,23,42,0.38)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">Satu langkah lagi</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Simpan profil untuk membuka semua fitur dashboard.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full rounded-2xl px-4 py-4 text-[17px] font-black text-white transition sm:w-auto sm:min-w-[250px] ${
                      isSubmitting
                        ? "cursor-not-allowed bg-slate-400"
                        : "bg-[linear-gradient(135deg,#0f6d55_0%,#1b8b67_55%,#d9aa52_130%)] shadow-[0_18px_35px_-20px_rgba(16,109,85,0.55)] hover:brightness-105"
                    }`}
                  >
                    {isSubmitting ? "Menyimpan profil..." : "Simpan dan Masuk ke Dashboard"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}

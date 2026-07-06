import { useState } from "react";
import { loginWithGoogle, type AuthProfile } from "../services/auth";

type LoginPageProps = {
  onLoginSuccess: (payload: {
    uid?: string;
    name: string;
    email: string;
    profile?: AuthProfile;
  }) => void;
};

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  return (
    <main className="app-mobile min-h-screen bg-[radial-gradient(circle_at_top,#edf8f3_0%,#f8faf7_35%,#eff4ee_100%)] px-4 py-5 pb-24">
      <div className="mx-auto w-full max-w-md md:max-w-[1040px] lg:max-w-[1160px]">
        <section className="overflow-hidden rounded-[28px] border border-[#d9e6de] bg-white shadow-[0_30px_90px_-40px_rgba(17,56,38,0.34)] lg:grid lg:grid-cols-[0.98fr_1.02fr]">
          <aside className="relative overflow-hidden border-b border-[#e6efe9] bg-[linear-gradient(155deg,#0b3e33_0%,#136b55_38%,#6fc39b_115%)] p-5 text-white lg:min-h-[660px] lg:border-b-0 lg:border-r lg:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(250,231,182,0.2),transparent_24%)]" />
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <img src="/assets/logo-web.png" alt="Logo Health Monitoring System" className="h-14 w-14 rounded-2xl bg-white/10 object-cover shadow-[0_18px_30px_-18px_rgba(0,0,0,0.5)]" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.34em] text-emerald-100">Health Monitoring</p>
                  <p className="mt-1 text-sm font-semibold text-white/90">Sistem pemantauan kesehatan</p>
                </div>
              </div>
              <h1 className="mt-5 max-w-[420px] text-[30px] font-black leading-[1.06] lg:text-[44px]">
                Login Google dulu, lalu kita siapkan akun Anda.
              </h1>
              <p className="mt-5 max-w-[420px] text-sm leading-7 text-emerald-50/90 lg:text-[14px]">
                Kita sederhanakan alurnya. Tidak ada lagi daftar email dan password. Masuk dengan Google, isi profil dasar
                sekali, lalu dashboard langsung siap dipakai.
              </p>

              <div className="mt-8 grid gap-3">
                {[
                  "Masuk hanya dengan akun Google",
                  "Isi profil dasar setelah login",
                  "Semua data alat, riwayat, dan dashboard terikat ke satu akun",
                ].map((item, index) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20 text-xs font-black">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6 text-white/92">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur lg:p-5">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-100">Alur Baru</p>
                <p className="mt-3 text-lg font-black text-white">Google Login - Isi Profil - Dashboard</p>
              </div>
            </div>
          </aside>

          <section className="flex min-h-[660px] items-center bg-white p-4 md:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-[440px] rounded-[30px] border border-[#e4ece7] bg-[linear-gradient(180deg,#fbfdfb_0%,#f3f8f5_100%)] p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.32)] md:p-6 lg:p-7">
              <p className="text-sm font-bold uppercase tracking-[0.26em] text-[#1f7a5c]">Masuk</p>
              <h2 className="mt-3 text-[28px] font-black leading-tight text-slate-900 lg:text-[32px]">Lanjut dengan Google</h2>

              <div className="mt-6 flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm">
                  <i className="fa-brands fa-google text-[26px] text-[#d14d3f]" />
                </div>
                <div>
                  <p className="text-[17px] font-black text-slate-900 lg:text-[18px]">Satu akun Google untuk mulai</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Aman, cepat, dan langsung lanjut ke pengisian profil.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (isSubmitting) return;
                  setIsSubmitting(true);
                  const result = await loginWithGoogle();
                  if (result.ok) {
                    setMessage(null);
                    onLoginSuccess({ uid: result.uid, name: result.name, email: result.email, profile: result.profile });
                    return;
                  }
                  setIsSubmitting(false);
                  setMessage({ tone: "error", text: result.message });
                }}
                disabled={isSubmitting}
                className={`mt-6 w-full rounded-2xl px-4 py-4 text-[16px] font-black transition lg:text-[17px] ${
                  isSubmitting
                    ? "cursor-not-allowed bg-slate-300 text-slate-600"
                    : "bg-[linear-gradient(135deg,#ffffff_0%,#f3f7f5_100%)] text-slate-800 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] hover:brightness-[0.99]"
                }`}
              >
                {isSubmitting ? "Membuka Google..." : "Lanjut dengan Google"}
              </button>

              {message ? (
                <p
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
                    message.tone === "error" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-700"
                  }`}
                >
                  {message.text}
                </p>
              ) : null}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

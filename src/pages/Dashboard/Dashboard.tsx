import MobileLayout from "../../components/layout/MobileLayout";
import AppCard from "../../components/cards/AppCard";
import SectionTitle from "../../components/ui/SectionTitle";

type ActivityRow = string[];

type DashboardPageProps = {
  bmi: number;
  bloodPressure: string;
  heartRate: number;
  steps: number;
  mealCalories: number;
  mealCarbs: number;
  mealProtein: number;
  mealFat: number;
  mealFiber: number;
  waterGlasses: number;
  activityRows: ActivityRow[];
  embedded?: boolean;
};

type MetricRingProps = {
  title: string;
  value: string;
  unit: string;
  percent: number;
  note: string;
  stroke: string;
  accentBg: string;
  icon: string;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function MetricRing({ title, value, unit, percent, note, stroke, accentBg, icon }: MetricRingProps) {
  const normalizedPercent = clampPercent(percent);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalizedPercent / 100) * circumference;

  return (
    <article className="dashboard-metric-card rounded-[24px] border border-[#e7edf0] bg-white p-3.5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] sm:rounded-[28px] sm:p-4">
      <div className="dashboard-metric-head mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">{title}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">{note}</p>
        </div>
        <span className={`dashboard-metric-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl ${accentBg} sm:h-10 sm:w-10 sm:rounded-2xl`}>
          <i className={`fa-solid ${icon}`} />
        </span>
      </div>
      <div className="dashboard-metric-body flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="dashboard-ring relative h-28 w-28 shrink-0 sm:h-32 sm:w-32">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#edf2f4" strokeWidth="11" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={stroke}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-black text-slate-900 sm:text-3xl">{value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px] sm:tracking-[0.18em]">{unit}</p>
            </div>
          </div>
        </div>
        <div className="dashboard-metric-info w-full space-y-3 text-center text-sm text-slate-600 sm:text-left">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.18em]">Progress</p>
            <p className="mt-1 text-base font-black text-slate-900 sm:text-lg">{normalizedPercent}%</p>
          </div>
          <div className="dashboard-progress-track h-2.5 w-full rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${normalizedPercent}%`, backgroundColor: stroke }} />
          </div>
        </div>
      </div>
    </article>
  );
}

function DashboardContent({
  bmi,
  bloodPressure,
  heartRate,
  steps,
  mealCalories,
  mealCarbs,
  mealProtein,
  mealFat,
  mealFiber,
  waterGlasses,
  activityRows,
}: Omit<DashboardPageProps, "embedded">) {
  const bloodPressureValue = bloodPressure !== "0/0" ? bloodPressure : "-";
  const systolicValue = bloodPressure !== "0/0" ? Number(bloodPressure.split("/")[0]) || 0 : 0;
  const bloodPressurePercent = systolicValue > 0 ? clampPercent((Math.min(180, systolicValue) / 180) * 100) : 0;
  const heartRatePercent = heartRate > 0 ? clampPercent((Math.min(160, heartRate) / 160) * 100) : 0;
  const stepsPercent = steps > 0 ? clampPercent((steps / 10000) * 100) : 0;
  const caloriesPercent = mealCalories > 0 ? clampPercent((mealCalories / 2000) * 100) : 0;
  const carbsPercent = mealCarbs > 0 ? clampPercent((mealCarbs / 420) * 100) : 0;
  const proteinPercent = mealProtein > 0 ? clampPercent((mealProtein / 125) * 100) : 0;
  const fatPercent = mealFat > 0 ? clampPercent((mealFat / 100) * 100) : 0;
  const fiberPercent = mealFiber > 0 ? clampPercent((mealFiber / 25) * 100) : 0;
  const waterPercent = waterGlasses > 0 ? clampPercent((waterGlasses / 8) * 100) : 0;
  const resolvedBmi = bmi > 0 ? bmi : 0;
  const bmiPercent = resolvedBmi > 0 ? clampPercent((Math.min(40, resolvedBmi) / 40) * 100) : 0;
  const bmiStatus =
    resolvedBmi <= 0
      ? "Belum ada BMI"
      : resolvedBmi < 18.5
        ? "BMI rendah"
        : resolvedBmi < 25
          ? "BMI normal"
          : resolvedBmi < 30
            ? "BMI berlebih"
            : "BMI tinggi";

  const healthMetrics: MetricRingProps[] = [
    {
      title: "Tekanan Darah",
      value: bloodPressureValue,
      unit: "mmHg",
      percent: bloodPressurePercent,
      note: "Pantau tekanan sistolik/diastolik harian",
      stroke: "#ef4444",
      accentBg: "bg-rose-50 text-rose-600",
      icon: "fa-heart-pulse",
    },
    {
      title: "Detak Jantung",
      value: heartRate > 0 ? String(heartRate) : "-",
      unit: "bpm",
      percent: heartRatePercent,
      note: "Dibandingkan batas aman aktivitas umum",
      stroke: "#f97316",
      accentBg: "bg-orange-50 text-orange-600",
      icon: "fa-heart-circle-check",
    },
    {
      title: "Langkah",
      value: steps > 0 ? steps.toLocaleString("id-ID") : "-",
      unit: "langkah",
      percent: stepsPercent,
      note: "Target standar 10.000 langkah per hari",
      stroke: "#10b981",
      accentBg: "bg-emerald-50 text-emerald-600",
      icon: "fa-shoe-prints",
    },
    {
      title: "Kalori Makan",
      value: mealCalories > 0 ? mealCalories.toLocaleString("id-ID") : "-",
      unit: "kkal",
      percent: caloriesPercent,
      note: "Akumulasi pola makan hari ini",
      stroke: "#0ea5e9",
      accentBg: "bg-sky-50 text-sky-600",
      icon: "fa-fire",
    },
    {
      title: "Protein",
      value: mealProtein > 0 ? mealProtein.toLocaleString("id-ID") : "-",
      unit: "gram",
      percent: proteinPercent,
      note: "Target 125 gram per hari",
      stroke: "#8b5cf6",
      accentBg: "bg-violet-50 text-violet-600",
      icon: "fa-drumstick-bite",
    },
    {
      title: "Hidrasi",
      value: waterGlasses > 0 ? String(waterGlasses) : "-",
      unit: "gelas",
      percent: waterPercent,
      note: "Target 8 gelas per hari",
      stroke: "#14b8a6",
      accentBg: "bg-teal-50 text-teal-600",
      icon: "fa-glass-water",
    },
    {
      title: "BMI",
      value: resolvedBmi > 0 ? resolvedBmi.toFixed(1) : "-",
      unit: "kg/m2",
      percent: bmiPercent,
      note: bmiStatus,
      stroke: "#2563eb",
      accentBg: "bg-blue-50 text-blue-600",
      icon: "fa-scale-balanced",
    },
  ];

  const nutritionBreakdown = [
    ["Karbohidrat", mealCarbs > 0 ? `${mealCarbs.toLocaleString("id-ID")} g` : "-", carbsPercent, "#f59e0b"],
    ["Protein", mealProtein > 0 ? `${mealProtein.toLocaleString("id-ID")} g` : "-", proteinPercent, "#8b5cf6"],
    ["Lemak", mealFat > 0 ? `${mealFat.toLocaleString("id-ID")} g` : "-", fatPercent, "#ef4444"],
    ["Serat", mealFiber > 0 ? `${mealFiber.toLocaleString("id-ID")} g` : "-", fiberPercent, "#22c55e"],
  ] as const;

  return (
    <section className="dashboard-mobile dashboard-page space-y-5">
      <div>
        <SectionTitle title="Parameter Utama" subtitle="Indikator inti kesehatan dan aktivitas yang paling sering dipantau." />
        <div className="dashboard-metric-grid mt-3 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {healthMetrics.map((metric) => (
            <MetricRing key={metric.title} {...metric} />
          ))}
        </div>
      </div>

      <div className="dashboard-panel-grid grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
        <AppCard className="dashboard-panel rounded-[24px] border border-[#e7edf0] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)] sm:rounded-[28px] sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle title="Komposisi Nutrisi" subtitle="Karbohidrat, protein, lemak, dan serat harian Anda." />
            <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Pola Makan</span>
          </div>
          <div className="space-y-4">
            {nutritionBreakdown.map((item) => (
              <div key={item[0]} className="dashboard-nutrition-row rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{item[0]}</p>
                    <p className="text-xs text-slate-500">{item[1]}</p>
                  </div>
                  <p className="text-lg font-black text-slate-900">{item[2]}%</p>
                </div>
                <div className="mt-3 h-2.5 w-full rounded-full bg-white">
                  <div className="h-full rounded-full" style={{ width: `${item[2]}%`, backgroundColor: item[3] }} />
                </div>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard className="dashboard-panel rounded-[24px] border border-[#e7edf0] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)] sm:rounded-[28px] sm:p-5">
          <div className="mb-4">
            <SectionTitle title="Aktivitas Terkini" subtitle="Ringkasan sesi terakhir yang paling baru terekam." />
          </div>
          <div className="space-y-3">
            {activityRows.slice(0, 4).map((row) => (
              <div key={`${row[1]}-${row[2]}`} className="dashboard-activity-row rounded-2xl border border-[#eef2f4] px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">
                      {row[0]} {row[1]}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row[2]}</p>
                  </div>
                  <span className="w-fit rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">{row[3]}</span>
                </div>
              </div>
            ))}
          </div>
        </AppCard>
      </div>
    </section>
  );
}

export default function DashboardPage(props: DashboardPageProps) {
  if (props.embedded) {
    return <DashboardContent {...props} />;
  }

  return (
    <MobileLayout>
      <DashboardContent {...props} />
    </MobileLayout>
  );
}

import { useMemo, useState } from "react";
import MobileLayout from "../../components/layout/MobileLayout";
import PageHeader from "../../components/layout/PageHeader";
import type { MeasurementHistoryDoc } from "../../types/storage";

const HISTORY_FILTERS = ["Semua", "Pengukuran", "Sinkronisasi Alat", "Aktivitas", "Pola Makan", "Hidrasi"] as const;
const HISTORY_RANGE_OPTIONS = ["7 Hari Terakhir", "30 Hari Terakhir", "Semua Waktu"] as const;
const HISTORY_MODE_OPTIONS = ["Event Final", "Pengukuran Tersimpan"] as const;
const HISTORY_VIEW_OPTIONS = ["Timeline Riwayat", "Tabel Pengukuran"] as const;
const HISTORY_FILTER_ICONS: Record<(typeof HISTORY_FILTERS)[number], string> = {
  Semua: "fa-layer-group",
  Pengukuran: "fa-stethoscope",
  "Sinkronisasi Alat": "fa-microchip",
  Aktivitas: "fa-shoe-prints",
  "Pola Makan": "fa-utensils",
  Hidrasi: "fa-droplet",
};

const INDONESIAN_MONTHS: Record<string, number> = {
  jan: 0,
  januari: 0,
  feb: 1,
  februari: 1,
  mar: 2,
  maret: 2,
  apr: 3,
  april: 3,
  mei: 4,
  jun: 5,
  juni: 5,
  jul: 6,
  juli: 6,
  agu: 7,
  agustus: 7,
  sep: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  des: 11,
  desember: 11,
};

const parseHistoryDate = (value: string) => {
  const datePart = value.split(",")[0]?.trim() || "";
  const match = datePart.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const year = Number(match[3]);
  const month = INDONESIAN_MONTHS[monthName];
  if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) return null;

  return new Date(year, month, day);
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(from).getTime() - startOfDay(to).getTime()) / 86400000);
const isWithinHistoryRange = (date: Date | null, range: (typeof HISTORY_RANGE_OPTIONS)[number]) => {
  if (!date) return false;
  if (range === "Semua Waktu") return true;
  const diffDays = daysBetween(new Date(), date);
  if (range === "7 Hari Terakhir") return diffDays >= 0 && diffDays <= 7;
  return diffDays >= 0 && diffDays <= 30;
};

const getHistoryGroupLabel = (value: string) => {
  const parsed = parseHistoryDate(value);
  if (!parsed) return "Lainnya";

  const today = startOfDay(new Date());
  const target = startOfDay(parsed);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return "Hari Ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays >= 2 && diffDays <= 7) return "7 Hari Terakhir";
  return "Riwayat Sebelumnya";
};

const getDataTypeTone = (dataType: string) => {
  switch (dataType) {
    case "Pengukuran":
      return {
        badge: "bg-cyan-50 text-cyan-700 border-cyan-200",
        status: "text-cyan-700",
      };
    case "Sinkronisasi Alat":
      return {
        badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
        status: "text-indigo-700",
      };
    case "Aktivitas":
      return {
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
        status: "text-emerald-700",
      };
    case "Pola Makan":
      return {
        badge: "bg-amber-50 text-amber-700 border-amber-200",
        status: "text-amber-700",
      };
    case "Hidrasi":
      return {
        badge: "bg-sky-50 text-sky-700 border-sky-200",
        status: "text-sky-700",
      };
    case "Tekanan Darah":
      return {
        badge: "bg-rose-50 text-rose-700 border-rose-200",
        status: "text-rose-700",
      };
    case "Detak Jantung":
      return {
        badge: "bg-orange-50 text-orange-700 border-orange-200",
        status: "text-orange-700",
      };
    case "Berat Badan":
      return {
        badge: "bg-sky-50 text-sky-700 border-sky-200",
        status: "text-sky-700",
      };
    case "Tinggi Badan":
      return {
        badge: "bg-cyan-50 text-cyan-700 border-cyan-200",
        status: "text-cyan-700",
      };
    default:
      return {
        badge: "bg-slate-50 text-slate-700 border-slate-200",
        status: "text-slate-700",
      };
  }
};

const getDataTypeIcon = (dataType: string) => {
  switch (dataType) {
    case "Pengukuran":
      return "fa-stethoscope";
    case "Sinkronisasi Alat":
      return "fa-microchip";
    case "Aktivitas":
      return "fa-shoe-prints";
    case "Pola Makan":
      return "fa-utensils";
    case "Hidrasi":
      return "fa-droplet";
    case "Tekanan Darah":
      return "fa-heart-pulse";
    case "Detak Jantung":
      return "fa-heart-circle-check";
    case "Berat Badan":
      return "fa-weight-scale";
    case "Tinggi Badan":
      return "fa-ruler-vertical";
    default:
      return "fa-circle-info";
  }
};

type HistoryChart = {
  title: string;
  value: string;
  gradient: string;
  hasData: boolean;
  bars: number[];
};

type MeasurementHistoryRow = MeasurementHistoryDoc & {
  timestamp: string;
};

type MeasurementDisplayRow = MeasurementHistoryRow & {
  bloodPressure: string;
  heartRate: string;
  height: string;
  weight: string;
  steps: string;
  meal: string;
};

type RiwayatPageProps = {
  embedded?: boolean;
  historyLoading: boolean;
  historyResetting: boolean;
  historyFilter: string;
  onSetHistoryFilter: (filter: string) => void;
  onExportHistory: (
    rows?: string[][],
    context?: { filterLabel?: string; rangeLabel?: string; modeLabel?: string }
  ) => void | Promise<void>;
  onResetMeasurements: () => void;
  onShowChartRange: (label: string) => void;
  historyCharts: HistoryChart[];
  measurementHistoryRows: MeasurementHistoryRow[];
  historyDetailRows: string[][];
  hasAnyData: boolean;
  hasBloodPressure: boolean;
  bloodPressure: string;
  hasHeartRate: boolean;
  heartRate: number;
  onRowAction: (row: string[]) => void;
  onShowReport: () => void;
};

function RiwayatContent({
  historyLoading,
  historyResetting,
  historyFilter,
  onSetHistoryFilter,
  onExportHistory,
  onResetMeasurements,
  onShowChartRange,
  historyCharts,
  measurementHistoryRows,
  historyDetailRows,
  hasAnyData,
  hasBloodPressure,
  bloodPressure,
  hasHeartRate,
  heartRate,
  onRowAction,
  onShowReport,
}: Omit<RiwayatPageProps, "embedded">) {
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<MeasurementDisplayRow | null>(null);
  const [historyRange, setHistoryRange] = useState<(typeof HISTORY_RANGE_OPTIONS)[number]>("7 Hari Terakhir");
  const [historyMode, setHistoryMode] = useState<(typeof HISTORY_MODE_OPTIONS)[number]>("Event Final");
  const [historyView, setHistoryView] = useState<(typeof HISTORY_VIEW_OPTIONS)[number]>("Timeline Riwayat");

  const formatMeasurementValue = (value: number, unit: string) => (Number(value) > 0 ? `${Number(value).toLocaleString("id-ID")} ${unit}` : "-");
  const formatBloodPressure = (sistolik: number, diastolik: number) =>
    Number(sistolik) > 0 && Number(diastolik) > 0 ? `${Number(sistolik)}/${Number(diastolik)} mmHg` : "-";
  const formatSteps = (value: number) => (Number(value) > 0 ? `${Number(value).toLocaleString("id-ID")} langkah` : "-");
  const categoryAllowsMeasurement = historyFilter === "Semua" || historyFilter === "Pengukuran";
  const filteredMeasurementRows = useMemo(
    () =>
      measurementHistoryRows.filter((row) => {
        const date = row.tanggal_pengukuran
          ? parseHistoryDate(row.tanggal_pengukuran) || new Date(row.tanggal_pengukuran)
          : null;
        return isWithinHistoryRange(date && !Number.isNaN(date.getTime()) ? date : null, historyRange);
      }),
    [historyRange, measurementHistoryRows]
  );
  const hasResettableMeasurementData = useMemo(
    () =>
      measurementHistoryRows.length > 0 ||
      historyDetailRows.some((row) => ["Pengukuran", "Sinkronisasi Alat", "Tekanan Darah", "Detak Jantung", "Berat Badan", "Tinggi Badan"].includes(row[1] || "")),
    [historyDetailRows, measurementHistoryRows]
  );
  const measurementCards: MeasurementDisplayRow[] = useMemo(
    () =>
      (categoryAllowsMeasurement ? filteredMeasurementRows : []).map((row) => ({
        ...row,
        title: row.timestamp,
        bloodPressure: formatBloodPressure(row.sistolik, row.diastolik),
        heartRate: formatMeasurementValue(row.detak_jantung, "bpm"),
        height: formatMeasurementValue(row.tinggi_badan, "cm"),
        weight: formatMeasurementValue(row.berat_badan, "kg"),
        steps: formatSteps(row.langkah_kaki),
        meal: row.pola_makan?.trim() || "-",
      })),
    [categoryAllowsMeasurement, filteredMeasurementRows]
  );
  const measurementTimelineRows = useMemo(
    () =>
      measurementCards.map((row) => {
        const compactNotes = [
          row.height !== "-" ? `TB ${row.height}` : "",
          row.weight !== "-" ? `BB ${row.weight}` : "",
          row.heartRate !== "-" ? `Detak ${row.heartRate}` : "",
          row.steps !== "-" ? row.steps : "",
          row.meal !== "-" ? `Makan ${row.meal}` : "",
        ]
          .filter(Boolean)
          .join(" • ");
        const primaryValue = row.bloodPressure !== "-" ? row.bloodPressure : row.heartRate !== "-" ? row.heartRate : row.weight !== "-" ? row.weight : row.height !== "-" ? row.height : row.steps;
        return [row.timestamp, "Pengukuran", primaryValue || "-", "Pengukuran", "Tersimpan", compactNotes || "Data pengukuran tersimpan", "Lihat"];
      }),
    [measurementCards]
  );
  const filteredTimelineSourceRows = useMemo(
    () =>
      historyDetailRows.filter((row) => {
        const parsed = parseHistoryDate(row[0]);
        return isWithinHistoryRange(parsed, historyRange);
      }),
    [historyDetailRows, historyRange]
  );
  const activeTimelineRows = historyMode === "Event Final" ? filteredTimelineSourceRows : measurementTimelineRows;
  const groupedHistoryRows = activeTimelineRows.reduce<Record<string, string[][]>>((groups, row) => {
    const label = getHistoryGroupLabel(row[0]);
    if (!groups[label]) groups[label] = [];
    groups[label].push(row);
    return groups;
  }, {});
  const orderedGroups = ["Hari Ini", "Kemarin", "7 Hari Terakhir", "Riwayat Sebelumnya", "Lainnya"].filter(
    (label) => groupedHistoryRows[label]?.length
  );
  const filterCounts = useMemo(
    () =>
      HISTORY_FILTERS.reduce<Record<(typeof HISTORY_FILTERS)[number], number>>((result, filter) => {
        if (filter === "Semua") {
          result[filter] = activeTimelineRows.length;
          return result;
        }
        result[filter] = activeTimelineRows.filter((row) => row[1] === filter).length;
        return result;
      }, {} as Record<(typeof HISTORY_FILTERS)[number], number>),
    [activeTimelineRows]
  );
  const measurementSummary = {
    total: measurementCards.length,
    latest: measurementCards[0] || null,
    averageSystolic:
      measurementCards.length > 0
        ? Math.round(measurementCards.reduce((total, row) => total + (Number(row.sistolik) || 0), 0) / measurementCards.length)
        : 0,
    averageDiastolic:
      measurementCards.length > 0
        ? Math.round(measurementCards.reduce((total, row) => total + (Number(row.diastolik) || 0), 0) / measurementCards.length)
        : 0,
    averageHeartRate:
      measurementCards.length > 0
        ? Math.round(measurementCards.reduce((total, row) => total + (Number(row.detak_jantung) || 0), 0) / measurementCards.length)
        : 0,
    latestSteps: measurementCards[0]?.langkah_kaki || 0,
  };
  const reportRows = measurementCards.slice(0, 8);
  const reportEventCount = activeTimelineRows.length;
  const openMeasurementDetail = (row: MeasurementDisplayRow) => setSelectedMeasurement(row);
  const cycleOption = <T extends string>(options: readonly T[], current: T): T => options[(options.indexOf(current) + 1) % options.length] as T;
  const handleToggleHistoryRange = () => {
    const nextRange = cycleOption(HISTORY_RANGE_OPTIONS, historyRange);
    setHistoryRange(nextRange);
    onShowChartRange(nextRange);
  };
  const handleToggleHistoryMode = () => setHistoryMode(cycleOption(HISTORY_MODE_OPTIONS, historyMode));
  const handleToggleHistoryView = () => setHistoryView(cycleOption(HISTORY_VIEW_OPTIONS, historyView));
  const handleSelectHistoryFilter = (filter: (typeof HISTORY_FILTERS)[number]) => {
    onSetHistoryFilter(filter);
    if (filter !== "Semua" && filter !== "Pengukuran") {
      setHistoryMode("Event Final");
      setHistoryView("Timeline Riwayat");
    }
  };
  const handleExportCurrentHistory = () => {
    const exportRows = historyMode === "Event Final" ? activeTimelineRows : measurementTimelineRows;
    void onExportHistory(exportRows, {
      filterLabel: historyFilter,
      rangeLabel: historyRange,
      modeLabel: historyMode,
    });
  };

  return (
    <>
      <PageHeader title="Riwayat Data" subtitle="Riwayat menampilkan event final yang sudah selesai dan bermakna untuk dibaca ulang." />

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        {historyLoading ? <p className="text-xs font-semibold text-amber-700">Memuat riwayat tersimpan...</p> : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {[
            {
              key: "range",
              label: "Rentang Waktu",
              value: historyRange,
              note: "Klik untuk ganti periode",
              icon: "fa-calendar-range",
              onClick: handleToggleHistoryRange,
            },
            {
              key: "mode",
              label: "Mode Data",
              value: historyMode,
              note: "Klik untuk ganti sumber tampilan",
              icon: "fa-sliders",
              onClick: handleToggleHistoryMode,
            },
            {
              key: "view",
              label: "Tampilan Aktif",
              value: historyView,
              note: "Klik untuk pindah tampilan",
              icon: "fa-table-list",
              onClick: handleToggleHistoryView,
            },
          ].map((control) => (
            <button
              key={control.key}
              type="button"
              onClick={control.onClick}
              className="flex items-start gap-3 rounded-[22px] border border-[#dfe6ea] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfa_100%)] px-4 py-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                <i className={`fa-solid ${control.icon}`} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{control.label}</span>
                <span className="mt-1 block text-[15px] font-black leading-tight text-slate-900">{control.value}</span>
                <span className="mt-1 block text-[12px] text-slate-500">{control.note}</span>
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={handleExportCurrentHistory}
            className="flex items-start gap-3 rounded-[22px] border border-emerald-200 bg-[linear-gradient(135deg,#effaf4_0%,#ffffff_100%)] px-4 py-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
              <i className="fa-solid fa-file-export" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Ekspor Data</span>
              <span className="mt-1 block text-[15px] font-black leading-tight text-slate-900">PDF Riwayat Aktif</span>
              <span className="mt-1 block text-[12px] text-slate-500">Mengikuti range, mode, dan filter saat ini</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onResetMeasurements}
            disabled={historyResetting || !hasResettableMeasurementData}
            className={`flex items-start gap-3 rounded-[22px] border px-4 py-3 text-left shadow-sm transition ${
              historyResetting || !hasResettableMeasurementData
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                : "border-rose-200 bg-[linear-gradient(135deg,#fff4f4_0%,#ffffff_100%)] hover:border-rose-300 hover:bg-rose-50"
            }`}
          >
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                historyResetting || !hasResettableMeasurementData ? "bg-slate-200 text-slate-500" : "bg-rose-600 text-white"
              }`}
            >
              <i className={`fa-solid ${historyResetting ? "fa-spinner fa-spin" : "fa-trash-can"}`} />
            </span>
            <span className="min-w-0">
              <span className={`block text-[11px] font-black uppercase tracking-[0.18em] ${historyResetting || !hasResettableMeasurementData ? "text-slate-400" : "text-rose-700"}`}>
                Reset Data
              </span>
              <span className="mt-1 block text-[15px] font-black leading-tight text-slate-900">
                {historyResetting ? "Menghapus Riwayat..." : "Hapus Pengukuran"}
              </span>
              <span className="mt-1 block text-[12px] text-slate-500">Bersihkan Firebase dan cache lokal akun ini</span>
            </span>
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {HISTORY_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => handleSelectHistoryFilter(filter)}
              className={`rounded-[18px] border px-3 py-3 text-left transition ${
                historyFilter === filter
                  ? "border-emerald-200 bg-[linear-gradient(135deg,#effaf4_0%,#dbf4e5_100%)] text-emerald-700 shadow-[0_14px_24px_-18px_rgba(5,150,105,0.38)]"
                  : "border-[#e4eaee] bg-white text-slate-600 hover:border-emerald-100 hover:bg-emerald-50/30"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-xl ${historyFilter === filter ? "bg-white text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
                  <i className={`fa-solid ${HISTORY_FILTER_ICONS[filter]}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-black leading-tight">{filter}</span>
                  <span className={`mt-1 block text-[11px] ${historyFilter === filter ? "text-emerald-700/80" : "text-slate-400"}`}>
                    {filterCounts[filter]} event
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
          Filter aktif: <span className="font-black text-slate-900">{historyFilter}</span> • Mode: <span className="font-black text-slate-900">{historyMode}</span> • Tampilan: <span className="font-black text-slate-900">{historyView}</span>
        </div>
      </section>

      {historyView === "Tabel Pengukuran" ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-800">
          Tampilan aktif: tabel pengukuran. Klik tombol di atas untuk beralih lagi ke timeline riwayat.
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h4 className="text-base font-semibold text-gray-900 sm:text-lg">Riwayat Pengukuran</h4>
            <p className="mt-1 text-xs text-slate-500">Seluruh data pengukuran tampil dalam tabel berdasarkan waktu pengukuran terakhir.</p>
          </div>
        </div>

        {measurementCards.length > 0 ? (
          <>
            <div className="mt-4 grid gap-3 sm:hidden">
              {measurementCards.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => openMeasurementDetail(record)}
                  className="rounded-2xl border border-[#e4eaee] bg-[linear-gradient(180deg,#fbfffd_0%,#ffffff_100%)] p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{record.timestamp}</p>
                      <p className="mt-1 text-xs text-slate-500">Ketuk untuk lihat detail lengkap</p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-xs text-slate-400" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tinggi</p>
                      <p className="mt-1 font-semibold text-slate-800">{record.height}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Berat</p>
                      <p className="mt-1 font-semibold text-slate-800">{record.weight}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tensi</p>
                      <p className="mt-1 font-semibold text-slate-800">{record.bloodPressure}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Detak</p>
                      <p className="mt-1 font-semibold text-slate-800">{record.heartRate}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Langkah</p>
                      <p className="mt-1 font-semibold text-slate-800">{record.steps}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pola Makan</p>
                      <p className="mt-1 line-clamp-2 font-semibold leading-5 text-slate-800">{record.meal}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[#e4eaee] sm:block">
              <div className="grid min-w-[860px] grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr_1.4fr] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                <span>Waktu</span>
                <span>Tinggi</span>
                <span>Berat</span>
                <span>Tensi</span>
                <span>Detak</span>
                <span>Langkah</span>
                <span>Pola Makan</span>
              </div>
              {measurementCards.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => openMeasurementDetail(record)}
                  className="grid min-w-[860px] grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr_1.4fr] gap-2 border-t border-[#eef2f6] px-3 py-3 text-left text-xs transition hover:bg-emerald-50/40"
                >
                  <span className="font-medium text-slate-700">{record.timestamp}</span>
                  <span>{record.height}</span>
                  <span>{record.weight}</span>
                  <span>{record.bloodPressure}</span>
                  <span>{record.heartRate}</span>
                  <span>{record.steps}</span>
                  <span className="line-clamp-2 text-slate-700">{record.meal}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-[#e4eaee] bg-slate-50 px-4 py-6 text-sm text-slate-600">
            {categoryAllowsMeasurement
              ? "Belum ada data pengukuran tersimpan pada rentang waktu ini. Saat kamu mengukur dari web atau ESP32, semua hasil akan muncul di sini per waktu pengukuran."
              : "Filter yang dipilih bukan kategori pengukuran. Pilih 'Semua' atau 'Pengukuran' untuk melihat tabel pengukuran."}
          </div>
        )}
      </section>

      {selectedMeasurement ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-600">Detail Pengukuran</p>
                <h3 className="mt-1 text-xl font-black text-slate-900">{selectedMeasurement.timestamp}</h3>
                <p className="mt-1 text-sm text-slate-500">Ketuk di luar modal atau tekan tombol tutup untuk kembali.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMeasurement(null)}
                className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                aria-label="Tutup detail"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tinggi Badan</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMeasurement.height}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Berat Badan</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMeasurement.weight}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tekanan Darah</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMeasurement.bloodPressure}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Detak Jantung</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMeasurement.heartRate}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Langkah</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMeasurement.steps}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Waktu Pengukuran</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedMeasurement.timestamp}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-3 sm:col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pola Makan</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">{selectedMeasurement.meal}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#f8fffc_0%,#ffffff_30%,#f8fafc_100%)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-600">Laporan Lengkap</p>
                <h3 className="mt-1 text-2xl font-black text-slate-900">Ringkasan Riwayat Kesehatan</h3>
                <p className="mt-1 text-sm text-slate-500">Laporan ini menampilkan data pengukuran terbaru dan ringkasan riwayat yang tersimpan.</p>
              </div>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                aria-label="Tutup laporan"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-74px)] overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Total Pengukuran</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">{measurementSummary.total}</p>
                  <p className="mt-1 text-xs text-slate-600">Semua sesi pengukuran yang tersimpan</p>
                </article>
                <article className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Rata-rata Tensi</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">
                    {measurementSummary.averageSystolic > 0 && measurementSummary.averageDiastolic > 0 ? `${measurementSummary.averageSystolic}/${measurementSummary.averageDiastolic}` : "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">mmHg</p>
                </article>
                <article className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Rata-rata Detak</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">{measurementSummary.averageHeartRate > 0 ? measurementSummary.averageHeartRate : "-"}</p>
                  <p className="mt-1 text-xs text-slate-600">bpm</p>
                </article>
                <article className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Event Riwayat</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">{reportEventCount}</p>
                  <p className="mt-1 text-xs text-slate-600">Pengukuran, aktivitas, nutrisi, dan hidrasi</p>
                </article>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
                <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-black text-slate-900">Detail Terbaru</h4>
                      <p className="mt-1 text-xs text-slate-500">Pengukuran paling baru yang masuk ke sistem</p>
                    </div>
                    {measurementSummary.latest ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                        Terbaru
                      </span>
                    ) : null}
                  </div>

                  {measurementSummary.latest ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Waktu</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{measurementSummary.latest.timestamp}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tinggi Badan</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatMeasurementValue(measurementSummary.latest.tinggi_badan, "cm")}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Berat Badan</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatMeasurementValue(measurementSummary.latest.berat_badan, "kg")}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tekanan Darah</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatBloodPressure(measurementSummary.latest.sistolik, measurementSummary.latest.diastolik)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Detak Jantung</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatMeasurementValue(measurementSummary.latest.detak_jantung, "bpm")}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Langkah</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatSteps(measurementSummary.latest.langkah_kaki)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3 sm:col-span-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pola Makan</p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">{measurementSummary.latest.pola_makan || "-"}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-[#e4eaee] bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      Belum ada pengukuran terbaru untuk ditampilkan.
                    </div>
                  )}
                </article>

                <article className="rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-sm">
                  <h4 className="text-lg font-black text-slate-900">Ringkasan Cepat</h4>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span>Total data pengukuran</span>
                      <span className="font-semibold">{measurementSummary.total}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span>Rata-rata tensi</span>
                      <span className="font-semibold">
                        {measurementSummary.averageSystolic > 0 && measurementSummary.averageDiastolic > 0 ? `${measurementSummary.averageSystolic}/${measurementSummary.averageDiastolic}` : "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span>Rata-rata detak</span>
                      <span className="font-semibold">{measurementSummary.averageHeartRate > 0 ? `${measurementSummary.averageHeartRate} bpm` : "-"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span>Langkah terakhir</span>
                      <span className="font-semibold">{measurementSummary.latestSteps > 0 ? `${Number(measurementSummary.latestSteps).toLocaleString("id-ID")} langkah` : "-"}</span>
                    </div>
                  </div>
                </article>
              </div>

              <article className="mt-5 rounded-2xl border border-[#e4eaee] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-black text-slate-900">Tabel Pengukuran Terbaru</h4>
                    <p className="mt-1 text-xs text-slate-500">8 pengukuran terakhir ditampilkan untuk memudahkan pengecekan cepat.</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                    {reportRows.length} baris
                  </span>
                </div>
                {reportRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-[#e4eaee]">
                    <div className="grid min-w-[860px] grid-cols-[1.25fr_1fr_1fr_1fr_1fr_1fr_1.4fr] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                      <span>Waktu</span>
                      <span>Tinggi</span>
                      <span>Berat</span>
                      <span>Tensi</span>
                      <span>Detak</span>
                      <span>Langkah</span>
                      <span>Pola Makan</span>
                    </div>
                    {reportRows.map((record) => (
                      <div key={record.id} className="grid min-w-[860px] grid-cols-[1.25fr_1fr_1fr_1fr_1fr_1fr_1.4fr] gap-2 border-t border-[#eef2f6] px-3 py-3 text-xs">
                        <span className="font-medium text-slate-700">{record.timestamp}</span>
                        <span>{record.height}</span>
                        <span>{record.weight}</span>
                        <span>{record.bloodPressure}</span>
                        <span>{record.heartRate}</span>
                        <span>{record.steps}</span>
                        <span className="line-clamp-2 text-slate-700">{record.meal}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#e4eaee] bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    Belum ada data pengukuran yang bisa dimasukkan ke laporan.
                  </div>
                )}
              </article>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 2xl:grid-cols-[2fr_1fr]">
        {historyView === "Timeline Riwayat" ? (
        <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h4 className="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Timeline Riwayat</h4>
          {orderedGroups.length > 0 ? (
            <div className="space-y-4">
              {orderedGroups.map((groupLabel) => (
                <div key={groupLabel} className="overflow-x-auto rounded-xl border border-[#e4eaee]">
                  <div className="border-b border-[#e4eaee] bg-emerald-50/70 px-3 py-2">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-800">{groupLabel}</p>
                    <p className="mt-1 text-[11px] font-medium text-emerald-700">{groupedHistoryRows[groupLabel].length} event tercatat</p>
                  </div>
                  <div className="grid min-w-[860px] grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1.2fr_.7fr] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                    <span>Tanggal & Waktu</span><span>Jenis Data</span><span>Nilai</span><span>Kategori</span><span>Status</span><span>Catatan</span><span>Aksi</span>
                  </div>
                  {groupedHistoryRows[groupLabel].map((row, index) => {
                    const tone = getDataTypeTone(row[1]);
                    return (
                      <div key={`${groupLabel}-${row[0]}-${row[1]}-${row[2]}-${index}`} className="grid min-w-[860px] grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1.2fr_.7fr] gap-2 border-t border-[#eef2f6] px-3 py-2 text-xs">
                        <span>{row[0]}</span>
                        <span>
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${tone.badge}`}>
                            <i className={`fa-solid ${getDataTypeIcon(row[1])}`} />
                            {row[1]}
                          </span>
                        </span>
                        <span className="font-semibold text-slate-800">{row[2]}</span>
                        <span>{row[3]}</span>
                        <span className={`font-bold ${tone.status}`}>{row[4]}</span>
                        <span>{row[5]}</span>
                        <button type="button" onClick={() => onRowAction(row)} className="text-left font-bold text-emerald-700">
                          {row[6] || "Lihat"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#e4eaee] bg-slate-50 px-4 py-6 text-sm text-slate-600">
              {historyMode === "Event Final"
                ? "Belum ada event riwayat final untuk filter ini. Riwayat baru akan muncul saat pengukuran disimpan, sinkronisasi alat berhasil, sesi aktivitas selesai, catatan makan dicatat, atau hidrasi disimpan dengan nilai yang valid."
                : "Belum ada data pengukuran tersimpan untuk rentang waktu ini."}
            </div>
          )}
        </article>
        ) : null}

        <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h4 className="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Statistik Mingguan</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>Total Event</span><span className="font-semibold">{hasAnyData ? activeTimelineRows.length : "-"}</span></div>
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>Rata-rata Tensi</span><span className="font-semibold">{hasBloodPressure ? bloodPressure : "-"}</span></div>
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>Rata-rata Jantung</span><span className="font-semibold">{hasHeartRate ? `${heartRate} bpm` : "-"}</span></div>
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>Rata-rata Tidur</span><span className="font-semibold">Belum ada data</span></div>
          </div>
          <button
            type="button"
            onClick={() => {
              setReportOpen(true);
              onShowReport();
            }}
            className="mt-3 w-full rounded-xl border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700"
          >
            Lihat Laporan Lengkap
          </button>
        </article>
      </section>
    </>
  );
}

export default function RiwayatPage(props: RiwayatPageProps) {
  if (props.embedded) {
    return <RiwayatContent {...props} />;
  }

  return (
    <MobileLayout>
      <RiwayatContent {...props} />
    </MobileLayout>
  );
}

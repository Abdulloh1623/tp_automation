// Uskuna analitikasi grafiklari — sof inline SVG (server komponentida ishlaydi,
// hook yo'q, tashqi kutubxona yo'q). finance-charts.tsx bilan bir xil o'lcham va
// theme-aware Tailwind fill-*/stroke-* konvensiyasi.

import type { FlowMonth, InstallSource } from "@/lib/inventory-stats";

const VW = 640;
const VH = 200;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };

/** Oqim grafigidagi seriyalar — sarlavha ostidagi izoh ham shundan chiziladi. */
export const FLOW_SERIES = [
  { key: "inbound", label: "Omborga kirim", fill: "fill-primary-500", dot: "bg-primary-500" },
  { key: "toUsta", label: "Ustaga berildi", fill: "fill-violet-500", dot: "bg-violet-500" },
  { key: "installed", label: "Mijozga o'rnatildi", fill: "fill-emerald-500", dot: "bg-emerald-500" },
  { key: "scrap", label: "Brak", fill: "fill-red-500", dot: "bg-red-500" },
] as const;

type SeriesKey = (typeof FLOW_SERIES)[number]["key"];

/** Oylik oqim — har oy uchun 4 ta ustun (kirim / ustaga / o'rnatildi / brak). */
export function FlowChart({ months }: { months: FlowMonth[] }) {
  const innerW = VW - PAD.left - PAD.right;
  const innerH = VH - PAD.top - PAD.bottom;
  const baseY = PAD.top + innerH;
  const max = Math.max(
    1,
    ...months.flatMap((m) => FLOW_SERIES.map((s) => m[s.key as SeriesKey])),
  );
  const n = Math.max(1, months.length);
  const slot = innerW / n;
  const bw = Math.min(9, (slot * 0.72) / FLOW_SERIES.length);
  const gap = 1.5;
  const groupW = FLOW_SERIES.length * bw + (FLOW_SERIES.length - 1) * gap;
  const labelEvery = n > 8 ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="h-48 w-full"
      role="img"
      aria-label="Oylik uskuna oqimi"
      preserveAspectRatio="none"
    >
      {[0, 0.5, 1].map((g) => {
        const gy = baseY - g * innerH;
        return (
          <g key={g}>
            <line
              x1={PAD.left}
              y1={gy}
              x2={PAD.left + innerW}
              y2={gy}
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth={1}
            />
            <text x={PAD.left + 2} y={gy - 3} className="fill-slate-400 dark:fill-slate-500" fontSize={10}>
              {Math.round(max * g)}
            </text>
          </g>
        );
      })}

      {months.map((m, i) => {
        const startX = PAD.left + slot * i + (slot - groupW) / 2;
        return (
          <g key={m.key}>
            {FLOW_SERIES.map((s, j) => {
              const v = m[s.key as SeriesKey];
              const h = (v / max) * innerH;
              return (
                <rect
                  key={s.key}
                  x={startX + j * (bw + gap)}
                  y={baseY - h}
                  width={bw}
                  height={h}
                  rx={1.5}
                  className={s.fill}
                >
                  <title>{`${m.label}: ${s.label} — ${v} dona`}</title>
                </rect>
              );
            })}
            {i % labelEvery === 0 && (
              <text
                x={PAD.left + slot * i + slot / 2}
                y={VH - 8}
                textAnchor="middle"
                className="fill-slate-400 dark:fill-slate-500"
                fontSize={10}
              >
                {m.label.slice(0, 3)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Grafik ostidagi rangli izoh. */
export function FlowLegend() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {FLOW_SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * O'rnatish manbasi — usta zaxirasidanmi yoki to'g'ridan-to'g'ri ombordanmi.
 * Manbasi yozilmagan tarixiy yozuvlar foizga KIRITILMAYDI (alohida eslatiladi).
 */
export function SourceSplit({ source }: { source: InstallSource }) {
  if (source.known === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500">
        Bu davrda manbasi aniq o'rnatish yo'q
      </p>
    );
  }
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="bg-violet-500" style={{ width: `${source.ustaPct}%` }} />
        <div className="bg-primary-500" style={{ width: `${source.warehousePct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            Usta zaxirasidan
          </div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {source.fromUsta} <span className="text-sm font-normal text-slate-400">({source.ustaPct}%)</span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-primary-500" />
            Ombordan (Toshkent)
          </div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {source.fromWarehouse}{" "}
            <span className="text-sm font-normal text-slate-400">({source.warehousePct}%)</span>
          </div>
        </div>
      </div>
      {source.legacy > 0 && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Yana {source.legacy} dona — tarixiy (import) yozuv, manbasi qayd etilmagan; foizga
          kiritilmadi.
        </p>
      )}
    </div>
  );
}

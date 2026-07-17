// Moliya paneli grafiklari — sof inline SVG (server komponentida ham ishlaydi,
// hook yo'q). Tailwind stroke-*/fill-* yordamchilari orqali theme-aware (yorug'/
// qorong'i). Tashqi kutubxona ishlatilmaydi.

type Point = { label: string; value: number };

const VW = 640; // viewBox kengligi
const VH = 200; // viewBox balandligi
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** MRR trend chizig'i (bitta valyuta seriyasi). */
export function LineChart({
  points,
  format,
  colorClass = "text-primary-500",
}: {
  points: Point[];
  format: (n: number) => string;
  colorClass?: string;
}) {
  const innerW = VW - PAD.left - PAD.right;
  const innerH = VH - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const n = points.length;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${PAD.left},${PAD.top + innerH} ${line} ${PAD.left + innerW},${PAD.top + innerH}`;
  const grid = [0, 0.5, 1];
  const labelEvery = n > 8 ? 2 : 1;

  return (
    <div className={colorClass}>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="h-48 w-full" role="img" preserveAspectRatio="none">
        {/* Panjara chiziqlari + Y qiymatlar */}
        {grid.map((g) => {
          const gy = PAD.top + innerH - g * innerH;
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
              <text
                x={PAD.left + 2}
                y={gy - 3}
                className="fill-slate-400 dark:fill-slate-500"
                fontSize={10}
              >
                {format(max * g)}
              </text>
            </g>
          );
        })}
        {/* Maydon (area) */}
        <polygon points={area} className="fill-current" opacity={0.12} />
        {/* Chiziq */}
        <polyline
          points={line}
          className="stroke-current"
          fill="none"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Nuqtalar */}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} className="fill-current" />
        ))}
        {/* X yorliqlari */}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={VH - 8}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400"
              fontSize={10}
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/** Oylik oqim — yangi (yuqoriga, yashil) va yo'qotilgan (pastga, qizil) mijozlar. */
export function MonthlyFlowChart({
  months,
}: {
  months: { label: string; newCount: number; lostCount: number }[];
}) {
  const innerW = VW - PAD.left - PAD.right;
  const half = (VH - PAD.top - PAD.bottom) / 2;
  const mid = PAD.top + half;
  const max = Math.max(1, ...months.map((m) => Math.max(m.newCount, m.lostCount)));
  const n = months.length;
  const slot = innerW / n;
  const bw = Math.min(18, slot * 0.5);
  const labelEvery = n > 8 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="h-48 w-full" role="img" preserveAspectRatio="none">
      <line
        x1={PAD.left}
        y1={mid}
        x2={PAD.left + innerW}
        y2={mid}
        className="stroke-slate-200 dark:stroke-slate-700"
        strokeWidth={1}
      />
      {months.map((m, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        const upH = (m.newCount / max) * half;
        const dnH = (m.lostCount / max) * half;
        return (
          <g key={i}>
            {/* Yangi (yuqoriga) */}
            <rect
              x={cx - bw / 2}
              y={mid - upH}
              width={bw}
              height={upH}
              rx={2}
              className="fill-emerald-500"
            />
            {m.newCount > 0 && (
              <text x={cx} y={mid - upH - 3} textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400" fontSize={9}>
                {m.newCount}
              </text>
            )}
            {/* Yo'qotilgan (pastga) */}
            <rect
              x={cx - bw / 2}
              y={mid}
              width={bw}
              height={dnH}
              rx={2}
              className="fill-red-500"
            />
            {m.lostCount > 0 && (
              <text x={cx} y={mid + dnH + 10} textAnchor="middle" className="fill-red-600 dark:fill-red-400" fontSize={9}>
                {m.lostCount}
              </text>
            )}
            {i % labelEvery === 0 && (
              <text x={cx} y={VH - 4} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize={10}>
                {m.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

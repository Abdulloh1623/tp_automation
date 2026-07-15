// Chart SVG'lari uchun umumiy mavzu (palitra, shrift, yordamchilar).

export const CHART_W = 1000;
export const FONT = "DejaVu Sans, Arial, Helvetica, sans-serif";

export const C = {
  ink: "#0f172a", // slate-900 — asosiy matn
  ink2: "#334155", // slate-700 — ikkilamchi matn
  muted: "#64748b", // slate-500
  faint: "#94a3b8", // slate-400
  grid: "#e9eef5", // yumshoq to'r chizig'i
  track: "#eef2f7", // bar/donut fon yo'lagi
  card: "#ffffff",
  border: "#e6ebf2",
  tile: "#f7f9fc", // KPI plita foni
  bg1: "#eef3fb", // fon gradient (yuqori)
  bg2: "#f7f9fc", // fon gradient (past)
  brand1: "#2a78d6", // brend ko'k
  brand2: "#4a3aa7", // brend binafsha (gradient uchun)
};

// Holat (delta / KPI urg'usi) ranglari
export const STATUS = {
  good: "#008300",
  warn: "#eda100",
  bad: "#e34948",
};

// Kategoriya (donut/bar segment) ranglari — dataviz validatoridan o'tgan tartib
// (CVD-xavfsiz, chroma floordan yuqori). Tartib O'ZGARMAYDI, aylantirilmaydi.
export const SERIES = [
  "#2a78d6", // ko'k
  "#1baf7a", // akva
  "#eda100", // sariq
  "#008300", // yashil
  "#4a3aa7", // binafsha
  "#e34948", // qizil
  "#e87ba4", // magenta
  "#eb6834", // to'q sariq
];

/** XML-xavfsiz matn (atribut va matn uchun). */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Butun sonni minglik ajratkich bilan. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Uzun yorliqni qisqartiradi. */
export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Card ramkasi — brend sarlavha bandi (chap: nom+sana, o'ng: brend nishoni),
 * ajratuvchi chiziq va pastki kolontitul bilan. Body header'dan keyin joylashadi.
 * Body koordinatalari uchun header pastki chegarasi ≈ y120 (ajratkich y104).
 */
export function frame(opts: {
  title: string;
  subtitle?: string;
  height: number; // umumiy balandlik
  body: string; // header'dan keyingi SVG
  footer?: string; // pastki kolontitul (default brend)
}): string {
  const { title, subtitle, height, body } = opts;
  const W = CHART_W;
  const left = 42;
  const brandW = 210;
  const brandX = W - 28 - brandW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="${FONT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bg1}"/>
      <stop offset="1" stop-color="${C.bg2}"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.brand1}"/>
      <stop offset="1" stop-color="${C.brand2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${height}" fill="url(#bg)"/>
  <rect x="14" y="14" width="${W - 28}" height="${height - 28}" rx="24" fill="${C.card}" stroke="${C.border}" stroke-width="1.5"/>
  <!-- Brend nishoni (o'ng yuqori) -->
  <rect x="${brandX}" y="34" width="${brandW}" height="42" rx="21" fill="url(#brand)"/>
  <circle cx="${brandX + 24}" cy="55" r="9" fill="#ffffff" fill-opacity="0.9"/>
  <text x="${brandX + 44}" y="61" font-size="17" font-weight="700" fill="#ffffff">TP Automation</text>
  <!-- Sarlavha -->
  <text x="${left + 4}" y="60" font-size="30" font-weight="700" fill="${C.ink}">${esc(title)}</text>
  ${subtitle ? `<text x="${left + 4}" y="88" font-size="16" fill="${C.muted}">${esc(subtitle)}</text>` : ""}
  <line x1="${left}" y1="104" x2="${W - 42}" y2="104" stroke="${C.grid}" stroke-width="1.5"/>
  ${body}
  <text x="${left + 2}" y="${height - 22}" font-size="13" fill="${C.faint}">${esc(opts.footer ?? "TP Automation CRM — avtomatik hisobot")}</text>
</svg>`;
}

/** Delta (o'zgarish) chipi — ▲/▼ rangli. good=true → yashil ijobiy. */
export function deltaChip(
  x: number,
  y: number,
  delta: { dir: "up" | "down" | "flat"; text: string; good: boolean },
): string {
  const color = delta.dir === "flat" ? C.faint : delta.good ? STATUS.good : STATUS.bad;
  const arrow = delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "▬";
  return `<text x="${x}" y="${y}" text-anchor="end" font-size="15" font-weight="700" fill="${color}">${arrow} ${esc(delta.text)}</text>`;
}

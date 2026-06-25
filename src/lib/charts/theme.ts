// Chart SVG'lari uchun umumiy mavzu (palitra, shrift, yordamchilar).

export const CHART_W = 1000;
export const FONT = "Arial, Helvetica, sans-serif";

export const C = {
  ink: "#0f172a", // slate-900
  muted: "#64748b", // slate-500
  faint: "#94a3b8", // slate-400
  grid: "#e2e8f0", // slate-200
  card: "#ffffff",
  border: "#e2e8f0",
  tile: "#f8fafc", // slate-50
  bg1: "#eef2ff", // indigo-50 (fon gradient)
  bg2: "#f8fafc",
};

// Seriya ranglari (donut/bar segmentlari)
export const SERIES = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#0ea5e9", // sky
  "#14b8a6", // teal
  "#94a3b8", // slate
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

/** Card ramkasi + sarlavha; ichiga body SVG joylashtiriladi. */
export function frame(opts: {
  title: string;
  subtitle?: string;
  height: number; // umumiy balandlik
  body: string; // header'dan keyingi SVG
  bodyTop?: number; // body boshlanish y (default 96)
}): string {
  const { title, subtitle, height, body } = opts;
  const W = CHART_W;
  const pad = 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="${FONT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bg1}"/>
      <stop offset="1" stop-color="${C.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${height}" fill="url(#bg)"/>
  <rect x="14" y="14" width="${W - 28}" height="${height - 28}" rx="22" fill="${C.card}" stroke="${C.border}" stroke-width="1.5"/>
  <text x="${pad + 14}" y="58" font-size="30" font-weight="700" fill="${C.ink}">${esc(title)}</text>
  ${subtitle ? `<text x="${pad + 14}" y="84" font-size="16" fill="${C.muted}">${esc(subtitle)}</text>` : ""}
  ${body}
</svg>`;
}

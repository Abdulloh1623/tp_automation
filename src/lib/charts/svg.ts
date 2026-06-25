// Hisobot grafiklari uchun SVG quruvchilar (modern flat dizayn).
import { CHART_W, C, SERIES, esc, fmtInt, truncate, frame } from "./theme";

export type KpiTile = { label: string; value: string; sub?: string; accent?: string };
export type NamedValue = { label: string; value: number };

const PAD = 42; // ichki chap chekka (frame bilan mos)

/** KPI muqova kartasi — sarlavha + sana + plitalar gridi. */
export function kpiCardSvg(opts: {
  title: string;
  dateLabel?: string;
  kpis: KpiTile[];
}): string {
  const { title, dateLabel, kpis } = opts;
  const top = 108;
  const cols = 2;
  const gap = 16;
  const tileW = (CHART_W - PAD * 2 - gap) / cols;
  const tileH = 92;
  const rows = Math.ceil(kpis.length / cols);
  const height = top + rows * (tileH + gap) + 12;

  let body = "";
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (tileW + gap);
    const y = top + row * (tileH + gap);
    const accent = k.accent ?? SERIES[i % SERIES.length];
    body += `
    <rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="14" fill="${C.tile}"/>
    <rect x="${x}" y="${y}" width="6" height="${tileH}" rx="3" fill="${accent}"/>
    <text x="${x + 22}" y="${y + 30}" font-size="15" fill="${C.muted}">${esc(k.label)}</text>
    <text x="${x + 22}" y="${y + 64}" font-size="30" font-weight="700" fill="${C.ink}">${esc(k.value)}</text>
    ${k.sub ? `<text x="${x + tileW - 18}" y="${y + 64}" text-anchor="end" font-size="14" fill="${C.faint}">${esc(k.sub)}</text>` : ""}`;
  });

  return frame({ title, subtitle: dateLabel, height, body });
}

/** Gorizontal bar chart. */
export function barChartSvg(opts: {
  title: string;
  subtitle?: string;
  items: NamedValue[];
  color?: string;
  unit?: string;
}): string {
  const { title, subtitle, items, color = SERIES[0], unit } = opts;
  const top = 112;
  const rowH = 48;
  const labelW = 230;
  const barX = PAD + labelW;
  const barMaxW = CHART_W - barX - 110;
  const height = Math.max(top + items.length * rowH + 24, 200);
  const max = Math.max(1, ...items.map((i) => i.value));

  let body = "";
  if (items.length === 0) {
    body = `<text x="${PAD}" y="${top + 30}" font-size="16" fill="${C.faint}">Ma'lumot yo'q</text>`;
  } else {
    items.forEach((it, i) => {
      const y = top + i * rowH;
      const w = Math.max(4, (it.value / max) * barMaxW);
      body += `
      <text x="${PAD}" y="${y + 22}" font-size="16" fill="${C.ink}">${esc(truncate(it.label, 20))}</text>
      <rect x="${barX}" y="${y + 6}" width="${barMaxW}" height="22" rx="11" fill="${C.tile}"/>
      <rect x="${barX}" y="${y + 6}" width="${w}" height="22" rx="11" fill="${color}"/>
      <text x="${barX + w + 12}" y="${y + 23}" font-size="15" font-weight="700" fill="${C.ink}">${fmtInt(it.value)}${unit ? " " + esc(unit) : ""}</text>`;
    });
  }
  return frame({ title, subtitle, height, body });
}

/** Donut chart + legend. */
export function donutChartSvg(opts: {
  title: string;
  subtitle?: string;
  items: NamedValue[];
}): string {
  const { title, subtitle, items } = opts;
  const height = Math.max(360, 150 + items.length * 34);
  const total = items.reduce((s, i) => s + i.value, 0);
  const cx = 220;
  const cy = height / 2 + 30;
  const r = 92;
  const sw = 34;
  const circ = 2 * Math.PI * r;

  let arcs = "";
  let offset = 0;
  items.forEach((it, i) => {
    if (it.value <= 0 || total === 0) return;
    const len = (it.value / total) * circ;
    const col = SERIES[i % SERIES.length];
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
  });
  if (total === 0) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.tile}" stroke-width="${sw}"/>`;
  }

  const center = `
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="34" font-weight="700" fill="${C.ink}">${fmtInt(total)}</text>
    <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="14" fill="${C.muted}">jami</text>`;

  // Legend
  const lx = 420;
  let ly = 130;
  let legend = "";
  items.forEach((it, i) => {
    const col = SERIES[i % SERIES.length];
    const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
    legend += `
    <rect x="${lx}" y="${ly - 12}" width="16" height="16" rx="4" fill="${col}"/>
    <text x="${lx + 26}" y="${ly + 1}" font-size="16" fill="${C.ink}">${esc(truncate(it.label, 24))}</text>
    <text x="${CHART_W - PAD}" y="${ly + 1}" text-anchor="end" font-size="15" font-weight="700" fill="${C.muted}">${fmtInt(it.value)} · ${pct}%</text>`;
    ly += 34;
  });
  if (items.length === 0) {
    legend = `<text x="${lx}" y="150" font-size="16" fill="${C.faint}">Ma'lumot yo'q</text>`;
  }

  return frame({ title, subtitle, height, body: arcs + center + legend });
}

/** Trend chiziq grafigi (gradientli to'ldirish). */
export function lineChartSvg(opts: {
  title: string;
  subtitle?: string;
  points: NamedValue[];
  unit?: string;
}): string {
  const { title, subtitle, points, unit } = opts;
  const height = 420;
  const x0 = 70;
  const x1 = CHART_W - 48;
  const y0 = 130; // tepa
  const y1 = height - 70; // past
  const plotW = x1 - x0;
  const plotH = y1 - y0;
  const max = Math.max(1, ...points.map((p) => p.value));
  const niceMax = max <= 5 ? 5 : Math.ceil(max / 5) * 5;

  const xAt = (i: number) =>
    points.length <= 1 ? x0 + plotW / 2 : x0 + (i / (points.length - 1)) * plotW;
  const yAt = (v: number) => y1 - (v / niceMax) * plotH;

  // Gridlines + Y yorliqlari
  let grid = "";
  const gridN = 4;
  for (let g = 0; g <= gridN; g++) {
    const val = (niceMax / gridN) * g;
    const gy = yAt(val);
    grid += `<line x1="${x0}" y1="${gy.toFixed(1)}" x2="${x1}" y2="${gy.toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>
    <text x="${x0 - 12}" y="${(gy + 5).toFixed(1)}" text-anchor="end" font-size="13" fill="${C.faint}">${fmtInt(val)}</text>`;
  }

  // X yorliqlari (siyrak)
  let xlabels = "";
  const step = Math.ceil(points.length / 7);
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    xlabels += `<text x="${xAt(i).toFixed(1)}" y="${y1 + 26}" text-anchor="middle" font-size="13" fill="${C.faint}">${esc(p.label)}</text>`;
  });

  let path = "";
  let area = "";
  let dots = "";
  if (points.length > 0) {
    const pts = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`);
    path = `M ${pts.join(" L ")}`;
    area = `M ${x0},${y1} L ${pts.join(" L ")} L ${x1},${y1} Z`;
    if (points.length <= 14) {
      dots = points
        .map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="4.5" fill="#fff" stroke="${SERIES[0]}" stroke-width="3"/>`)
        .join("");
    }
  }

  const body = `
    <defs>
      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${SERIES[0]}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${SERIES[0]}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    ${area ? `<path d="${area}" fill="url(#area)"/>` : ""}
    ${path ? `<path d="${path}" fill="none" stroke="${SERIES[0]}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
    ${dots}
    ${xlabels}
    ${unit ? `<text x="${x0}" y="${y0 - 16}" font-size="13" fill="${C.faint}">${esc(unit)}</text>` : ""}`;

  return frame({ title, subtitle, height, body });
}

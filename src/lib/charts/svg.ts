// Hisobot grafiklari uchun SVG quruvchilar (modern flat dizayn).
import { CHART_W, C, STATUS, SERIES, esc, fmtInt, truncate, frame, deltaChip } from "./theme";

export type Delta = { dir: "up" | "down" | "flat"; text: string; good: boolean };
export type KpiTile = {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  delta?: Delta;
};
export type NamedValue = { label: string; value: number };

const PAD = 42; // ichki chap chekka (frame bilan mos)
const BODY_TOP = 128; // header ajratkichidan (y104) keyin

/** KPI muqova kartasi — sarlavha + sana + rangli plitalar gridi (delta bilan). */
export function kpiCardSvg(opts: {
  title: string;
  dateLabel?: string;
  kpis: KpiTile[];
  footer?: string;
}): string {
  const { title, dateLabel, kpis } = opts;
  const cols = 2;
  const gap = 16;
  const tileW = (CHART_W - PAD * 2 - gap) / cols;
  const tileH = 104;
  const rows = Math.ceil(kpis.length / cols);
  const height = BODY_TOP + rows * (tileH + gap) + 40;

  let body = "";
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (tileW + gap);
    const y = BODY_TOP + row * (tileH + gap);
    const accent = k.accent ?? SERIES[i % SERIES.length];
    body += `
    <rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="16" fill="${C.tile}"/>
    <rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="16" fill="${accent}" fill-opacity="0.06"/>
    <rect x="${x}" y="${y + 14}" width="6" height="${tileH - 28}" rx="3" fill="${accent}"/>
    <text x="${x + 26}" y="${y + 36}" font-size="16" fill="${C.muted}">${esc(k.label)}</text>
    <text x="${x + 26}" y="${y + 78}" font-size="34" font-weight="700" fill="${C.ink}">${esc(k.value)}</text>
    ${k.delta ? deltaChip(x + tileW - 20, y + 38, k.delta) : ""}
    ${k.sub ? `<text x="${x + tileW - 20}" y="${y + 80}" text-anchor="end" font-size="14" fill="${C.faint}">${esc(k.sub)}</text>` : ""}`;
  });

  return frame({ title, subtitle: dateLabel, height, body, footer: opts.footer });
}

/** Gorizontal bar chart — reyting nishoni + gradientli ustun. */
export function barChartSvg(opts: {
  title: string;
  subtitle?: string;
  items: NamedValue[];
  color?: string;
  unit?: string;
}): string {
  const { title, subtitle, items, color = SERIES[0], unit } = opts;
  const rowH = 50;
  const labelW = 250;
  const barX = PAD + labelW;
  const barMaxW = CHART_W - barX - 120;
  const height = Math.max(BODY_TOP + items.length * rowH + 40, 240);
  const max = Math.max(1, ...items.map((i) => i.value));
  const gradId = "barfill";

  let body = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${color}" stop-opacity="0.85"/>
    <stop offset="1" stop-color="${color}"/></linearGradient></defs>`;
  if (items.length === 0) {
    body += `<text x="${PAD}" y="${BODY_TOP + 30}" font-size="16" fill="${C.faint}">Ma'lumot yo'q</text>`;
  } else {
    items.forEach((it, i) => {
      const y = BODY_TOP + i * rowH;
      const w = Math.max(6, (it.value / max) * barMaxW);
      body += `
      <circle cx="${PAD + 12}" cy="${y + 18}" r="12" fill="${color}" fill-opacity="0.12"/>
      <text x="${PAD + 12}" y="${y + 23}" text-anchor="middle" font-size="13" font-weight="700" fill="${color}">${i + 1}</text>
      <text x="${PAD + 34}" y="${y + 23}" font-size="16" fill="${C.ink2}">${esc(truncate(it.label, 22))}</text>
      <rect x="${barX}" y="${y + 4}" width="${barMaxW}" height="24" rx="12" fill="${C.track}"/>
      <rect x="${barX}" y="${y + 4}" width="${w}" height="24" rx="12" fill="url(#${gradId})"/>
      <text x="${barX + w + 12}" y="${y + 22}" font-size="15" font-weight="700" fill="${C.ink}">${fmtInt(it.value)}${unit ? " " + esc(unit) : ""}</text>`;
    });
  }
  return frame({ title, subtitle, height, body });
}

/** Donut chart — segmentlar orasida 2px oraliq + legend. */
export function donutChartSvg(opts: {
  title: string;
  subtitle?: string;
  items: NamedValue[];
}): string {
  const { title, subtitle, items } = opts;
  const height = Math.max(384, 176 + items.length * 36);
  const total = items.reduce((s, i) => s + i.value, 0);
  const cx = 226;
  const cy = height / 2 + 34;
  const r = 96;
  const sw = 32;
  const circ = 2 * Math.PI * r;
  const gapPx = 2; // segmentlar orasidagi sirt oralig'i (mark spec)

  let arcs = "";
  let offset = 0;
  const drawn = items.filter((it) => it.value > 0);
  drawn.forEach((it, i) => {
    if (total === 0) return;
    const raw = (it.value / total) * circ;
    const len = Math.max(0.5, raw - (drawn.length > 1 ? gapPx : 0));
    const col = SERIES[items.indexOf(it) % SERIES.length];
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += raw;
  });
  if (total === 0) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.track}" stroke-width="${sw}"/>`;
  }

  const center = `
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="38" font-weight="700" fill="${C.ink}">${fmtInt(total)}</text>
    <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="15" fill="${C.muted}">jami</text>`;

  // Legend
  const lx = 440;
  let ly = BODY_TOP + 24;
  let legend = "";
  items.forEach((it, i) => {
    const col = SERIES[i % SERIES.length];
    const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
    legend += `
    <rect x="${lx}" y="${ly - 13}" width="16" height="16" rx="5" fill="${col}"/>
    <text x="${lx + 26}" y="${ly}" font-size="16" fill="${C.ink2}">${esc(truncate(it.label, 24))}</text>
    <text x="${CHART_W - PAD}" y="${ly}" text-anchor="end" font-size="15" font-weight="700" fill="${C.muted}">${fmtInt(it.value)} · ${pct}%</text>`;
    ly += 36;
  });
  if (items.length === 0) {
    legend = `<text x="${lx}" y="${BODY_TOP + 40}" font-size="16" fill="${C.faint}">Ma'lumot yo'q</text>`;
  }

  return frame({ title, subtitle, height, body: arcs + center + legend });
}

/** Trend chiziq grafigi — gradient to'ldirish + o'rtacha chiziq + oxirgi nuqta urg'usi. */
export function lineChartSvg(opts: {
  title: string;
  subtitle?: string;
  points: NamedValue[];
  unit?: string;
}): string {
  const { title, subtitle, points, unit } = opts;
  const height = 440;
  const x0 = 76;
  const x1 = CHART_W - 52;
  const y0 = BODY_TOP + 34;
  const y1 = height - 72;
  const plotW = x1 - x0;
  const plotH = y1 - y0;
  const max = Math.max(1, ...points.map((p) => p.value));
  const niceMax = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  const avg = points.length ? points.reduce((s, p) => s + p.value, 0) / points.length : 0;

  const xAt = (i: number) =>
    points.length <= 1 ? x0 + plotW / 2 : x0 + (i / (points.length - 1)) * plotW;
  const yAt = (v: number) => y1 - (v / niceMax) * plotH;

  let grid = "";
  const gridN = 4;
  for (let g = 0; g <= gridN; g++) {
    const val = (niceMax / gridN) * g;
    const gy = yAt(val);
    grid += `<line x1="${x0}" y1="${gy.toFixed(1)}" x2="${x1}" y2="${gy.toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>
    <text x="${x0 - 14}" y="${(gy + 5).toFixed(1)}" text-anchor="end" font-size="13" fill="${C.faint}">${fmtInt(val)}</text>`;
  }

  // O'rtacha chiziq (uzuq)
  const avgY = yAt(avg);
  const avgLine =
    points.length > 1
      ? `<line x1="${x0}" y1="${avgY.toFixed(1)}" x2="${x1}" y2="${avgY.toFixed(1)}" stroke="${C.faint}" stroke-width="1.5" stroke-dasharray="6 5"/>
         <text x="${x1}" y="${(avgY - 8).toFixed(1)}" text-anchor="end" font-size="12" fill="${C.faint}">o'rtacha ${fmtInt(avg)}</text>`
      : "";

  let xlabels = "";
  const step = Math.max(1, Math.ceil(points.length / 7));
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    xlabels += `<text x="${xAt(i).toFixed(1)}" y="${y1 + 28}" text-anchor="middle" font-size="13" fill="${C.faint}">${esc(p.label)}</text>`;
  });

  let path = "";
  let area = "";
  let dots = "";
  let lastLabel = "";
  if (points.length > 0) {
    const pts = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`);
    path = `M ${pts.join(" L ")}`;
    area = `M ${x0},${y1} L ${pts.join(" L ")} L ${x1},${y1} Z`;
    if (points.length <= 14) {
      dots = points
        .map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="4.5" fill="#fff" stroke="${SERIES[0]}" stroke-width="3"/>`)
        .join("");
    }
    // Oxirgi nuqta urg'usi + qiymati
    const li = points.length - 1;
    const lx = xAt(li);
    const lyy = yAt(points[li].value);
    lastLabel = `
      <circle cx="${lx.toFixed(1)}" cy="${lyy.toFixed(1)}" r="6.5" fill="${SERIES[0]}" stroke="#fff" stroke-width="3"/>
      <rect x="${(lx - 34).toFixed(1)}" y="${(lyy - 42).toFixed(1)}" width="68" height="26" rx="13" fill="${SERIES[0]}"/>
      <text x="${lx.toFixed(1)}" y="${(lyy - 24).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${fmtInt(points[li].value)}</text>`;
  }

  const body = `
    <defs>
      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${SERIES[0]}" stop-opacity="0.24"/>
        <stop offset="1" stop-color="${SERIES[0]}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    ${avgLine}
    ${area ? `<path d="${area}" fill="url(#area)"/>` : ""}
    ${path ? `<path d="${path}" fill="none" stroke="${SERIES[0]}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
    ${dots}
    ${lastLabel}
    ${xlabels}
    ${unit ? `<text x="${x0}" y="${y0 - 14}" font-size="13" fill="${C.faint}">${esc(unit)}</text>` : ""}`;

  return frame({ title, subtitle, height, body });
}

// STATUS ranglaridan foydalanish uchun re-export (reports.ts)
export { STATUS };

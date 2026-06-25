// Telegram hisobotlari uchun matn quruvchilar — framework-agnostik (faqat Prisma).
// Next.js va worker (tsx) ikkalasida ham ishlaydi.

import { db } from "./db";
import { formatMoney } from "./utils";
import { callResultLabel, clientStatusLabel } from "./constants";
import { paymentState } from "./payment-status";
import { svgToPng } from "./render-image";
import {
  kpiCardSvg,
  barChartSvg,
  donutChartSvg,
  lineChartSvg,
  type KpiTile,
  type NamedValue,
} from "./charts/svg";
import { escapeHtml, type AlbumItem } from "./telegram";

const TZ_MIN = 5 * 60; // UTC+5 (O'zbekiston)

/** UTC+5 kun boshini (real UTC instant) qaytaradi. daysAgo=0 → bugun. */
export function startOfTzDay(daysAgo = 0): Date {
  const s = new Date(Date.now() + TZ_MIN * 60000);
  s.setUTCDate(s.getUTCDate() - daysAgo);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - TZ_MIN * 60000);
}

/** UTC+5 oy boshini qaytaradi. */
export function startOfTzMonth(): Date {
  const s = new Date(Date.now() + TZ_MIN * 60000);
  s.setUTCDate(1);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - TZ_MIN * 60000);
}

/** UTC+5 bo'yicha "DD.MM.YYYY". */
export function tzDateLabel(d = new Date()): string {
  const s = new Date(d.getTime() + TZ_MIN * 60000);
  const dd = String(s.getUTCDate()).padStart(2, "0");
  const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${s.getUTCFullYear()}`;
}

type Money = { USD: number; UZS: number };
function add(m: Money, currency: string, amount: number) {
  m[currency === "UZS" ? "UZS" : "USD"] += amount;
}
function money2(m: Money): string {
  const parts: string[] = [];
  if (m.USD > 0) parts.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) parts.push(formatMoney(m.UZS, "UZS"));
  return parts.length ? parts.join(" + ") : "0";
}

export type PeriodStats = {
  payments: { count: number; sum: Money };
  calls: { count: number; byResult: { label: string; value: number }[] };
  newClients: number;
  ticketsOpened: number;
  ticketsResolved: number;
  ustaDone: number;
  topOperators: { name: string; calls: number; collected: string }[];
};

/** Berilgan davr uchun ko'rsatkichlarni yig'adi. */
export async function gatherPeriod(start: Date, end: Date): Promise<PeriodStats> {
  const [payments, calls, newClients, ticketsOpened, ticketsResolved, ustaDone, operators] =
    await Promise.all([
      db.payment.findMany({
        where: { paidAt: { gte: start, lt: end } },
        select: { amount: true, currency: true, recordedById: true },
      }),
      db.callLog.findMany({
        where: { calledAt: { gte: start, lt: end } },
        select: { result: true, operatorId: true },
      }),
      db.client.count({ where: { createdAt: { gte: start, lt: end } } }),
      db.ticket.count({ where: { createdAt: { gte: start, lt: end } } }),
      db.ticket.count({ where: { resolvedAt: { gte: start, lt: end } } }),
      db.client.count({ where: { ustaStatus: "DONE", updatedAt: { gte: start, lt: end } } }),
      db.user.findMany({
        where: { role: { in: ["OPERATOR", "ADMIN"] } },
        select: { id: true, name: true },
      }),
    ]);

  const paySum: Money = { USD: 0, UZS: 0 };
  for (const p of payments) add(paySum, p.currency, p.amount);

  const resultMap = new Map<string, number>();
  for (const c of calls) resultMap.set(c.result, (resultMap.get(c.result) ?? 0) + 1);
  const byResult = [...resultMap.entries()]
    .map(([k, v]) => ({ label: callResultLabel(k), value: v }))
    .sort((a, b) => b.value - a.value);

  const callsByOp = new Map<string, number>();
  for (const c of calls)
    if (c.operatorId) callsByOp.set(c.operatorId, (callsByOp.get(c.operatorId) ?? 0) + 1);
  const payByOp = new Map<string, Money>();
  for (const p of payments) {
    if (!p.recordedById) continue;
    const e = payByOp.get(p.recordedById) ?? { USD: 0, UZS: 0 };
    add(e, p.currency, p.amount);
    payByOp.set(p.recordedById, e);
  }
  const topOperators = operators
    .map((o) => ({
      name: o.name,
      calls: callsByOp.get(o.id) ?? 0,
      collected: money2(payByOp.get(o.id) ?? { USD: 0, UZS: 0 }),
      _c: callsByOp.get(o.id) ?? 0,
    }))
    .filter((o) => o._c > 0)
    .sort((a, b) => b._c - a._c)
    .slice(0, 5)
    .map(({ name, calls, collected }) => ({ name, calls, collected }));

  return {
    payments: { count: payments.length, sum: paySum },
    calls: { count: calls.length, byResult },
    newClients,
    ticketsOpened,
    ticketsResolved,
    ustaDone,
    topOperators,
  };
}

/** Umumiy holat (snapshot) — davrdan qat'i nazar. */
async function snapshot() {
  const clients = await db.client.findMany({
    select: { status: true, currency: true, monthlyAmount: true, nextPaymentDate: true },
  });
  const active = clients.filter((c) => c.status === "ACTIVE");
  const mrr: Money = { USD: 0, UZS: 0 };
  for (const c of active) add(mrr, c.currency, c.monthlyAmount);
  const overdue = active.filter((c) => paymentState(c.nextPaymentDate) === "OVERDUE");
  const overdueSum: Money = { USD: 0, UZS: 0 };
  for (const c of overdue) add(overdueSum, c.currency, c.monthlyAmount);
  const openTickets = await db.ticket.count({ where: { status: { not: "RESOLVED" } } });
  return {
    total: clients.length,
    active: active.length,
    mrr: money2(mrr),
    overdueCount: overdue.length,
    overdueSum: money2(overdueSum),
    openTickets,
  };
}

function periodLines(s: PeriodStats): string {
  const lines: string[] = [];
  lines.push(`💵 Yig'im: <b>${money2(s.payments.sum)}</b> (${s.payments.count} to'lov)`);
  lines.push(`📞 Qo'ng'iroqlar: <b>${s.calls.count}</b>`);
  if (s.calls.byResult.length) {
    const top = s.calls.byResult.slice(0, 4).map((r) => `${r.label}: ${r.value}`).join(", ");
    lines.push(`   <i>${top}</i>`);
  }
  lines.push(`🟢 Yangi mijoz: <b>${s.newClients}</b>`);
  lines.push(`🎫 Muammo: +${s.ticketsOpened} ochildi / ${s.ticketsResolved} hal qilindi`);
  lines.push(`🔧 Usta bajardi: <b>${s.ustaDone}</b>`);
  if (s.topOperators.length) {
    lines.push("");
    lines.push("<b>Operatorlar:</b>");
    for (const o of s.topOperators) {
      lines.push(`• ${escapeHtml(o.name)} — ${o.calls} qo'ng'iroq, yig'im ${o.collected}`);
    }
  }
  return lines.join("\n");
}

function snapshotLines(s: Awaited<ReturnType<typeof snapshot>>): string {
  return [
    "",
    "<b>Umumiy holat:</b>",
    `👥 Mijozlar: ${s.total} (faol ${s.active})`,
    `📈 MRR: ${s.mrr}`,
    `⏰ Qarzdorlar: ${s.overdueCount} (${s.overdueSum})`,
    `🎫 Ochiq muammolar: ${s.openTickets}`,
  ].join("\n");
}

export async function buildDailyReport(): Promise<string> {
  const start = startOfTzDay(0);
  const end = new Date();
  const [stats, snap] = await Promise.all([gatherPeriod(start, end), snapshot()]);
  return (
    `📊 <b>Kunlik hisobot</b> — ${tzDateLabel()}\n\n` +
    periodLines(stats) +
    "\n" +
    snapshotLines(snap)
  );
}

export async function buildWeeklyReport(): Promise<string> {
  const start = startOfTzDay(6); // oxirgi 7 kun
  const end = new Date();
  const [stats, snap] = await Promise.all([gatherPeriod(start, end), snapshot()]);
  return (
    `📅 <b>Haftalik hisobot</b> (oxirgi 7 kun)\n` +
    `${tzDateLabel(start)} – ${tzDateLabel()}\n\n` +
    periodLines(stats) +
    "\n" +
    snapshotLines(snap)
  );
}

export async function buildMonthlyReport(): Promise<string> {
  const start = startOfTzMonth();
  const end = new Date();
  const [stats, snap] = await Promise.all([gatherPeriod(start, end), snapshot()]);
  return (
    `🗓 <b>Oylik hisobot</b>\n${tzDateLabel(start)} – ${tzDateLabel()}\n\n` +
    periodLines(stats) +
    "\n" +
    snapshotLines(snap)
  );
}

export type ReportKind = "daily" | "weekly" | "monthly";

export async function buildReport(kind: ReportKind): Promise<string> {
  if (kind === "weekly") return buildWeeklyReport();
  if (kind === "monthly") return buildMonthlyReport();
  return buildDailyReport();
}

// ============ Grafikli hisobot (rasm albomi) ============

type Bucket = { label: string; start: Date; end: Date };

/** Oxirgi n kun uchun (UTC+5) kunlik oraliqlar. */
function dayBuckets(n: number): Bucket[] {
  const arr: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = startOfTzDay(i);
    const end = startOfTzDay(i - 1); // keyingi kun boshi
    const s = new Date(start.getTime() + TZ_MIN * 60000);
    const label = `${String(s.getUTCDate()).padStart(2, "0")}.${String(s.getUTCMonth() + 1).padStart(2, "0")}`;
    arr.push({ label, start, end });
  }
  return arr;
}

function moneyCompact(usd: number, uzs: number): string {
  const parts: string[] = [];
  if (usd > 0) parts.push(usd >= 1000 ? `$${(usd / 1000).toFixed(1)}k` : `$${Math.round(usd)}`);
  if (uzs > 0)
    parts.push(
      uzs >= 1e6
        ? `${(uzs / 1e6).toFixed(2)}M so'm`
        : uzs >= 1000
          ? `${Math.round(uzs / 1000)}k so'm`
          : `${Math.round(uzs)} so'm`,
    );
  return parts.length ? parts.join(" + ") : "0";
}

type ChartBundle = {
  title: string;
  dateLabel: string;
  caption: string;
  kpis: KpiTile[];
  trend: { points: NamedValue[]; unit: string; title: string };
  operators: NamedValue[];
  callResults: NamedValue[];
  status: NamedValue[];
  regions: NamedValue[];
};

async function gatherChartData(kind: ReportKind): Promise<ChartBundle> {
  const N = kind === "monthly" ? 30 : 7;
  const buckets = dayBuckets(N);
  const periodStart =
    kind === "daily" ? startOfTzDay(0) : kind === "weekly" ? startOfTzDay(6) : startOfTzMonth();
  const trendStart = buckets[0].start < periodStart ? buckets[0].start : periodStart;

  const [calls, payments, clients, operators, ustaDone] = await Promise.all([
    db.callLog.findMany({
      where: { calledAt: { gte: trendStart } },
      select: { calledAt: true, result: true, operatorId: true },
    }),
    db.payment.findMany({
      where: { paidAt: { gte: periodStart } },
      select: { amount: true, currency: true },
    }),
    db.client.findMany({
      select: {
        status: true,
        region: true,
        currency: true,
        monthlyAmount: true,
        nextPaymentDate: true,
        createdAt: true,
      },
    }),
    db.user.findMany({
      where: { role: { in: ["OPERATOR", "ADMIN"] } },
      select: { id: true, name: true },
    }),
    db.client.count({ where: { ustaStatus: "DONE", updatedAt: { gte: periodStart } } }),
  ]);

  const trendPoints: NamedValue[] = buckets.map((b) => ({
    label: b.label,
    value: calls.filter((c) => c.calledAt >= b.start && c.calledAt < b.end).length,
  }));

  const pcalls = calls.filter((c) => c.calledAt >= periodStart);

  const opMap = new Map<string, number>();
  for (const c of pcalls) if (c.operatorId) opMap.set(c.operatorId, (opMap.get(c.operatorId) ?? 0) + 1);
  const opName = new Map(operators.map((o) => [o.id, o.name]));
  const operatorsItems: NamedValue[] = [...opMap.entries()]
    .map(([id, v]) => ({ label: opName.get(id) ?? "—", value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const resMap = new Map<string, number>();
  for (const c of pcalls) resMap.set(c.result, (resMap.get(c.result) ?? 0) + 1);
  const callResults: NamedValue[] = [...resMap.entries()]
    .map(([k, v]) => ({ label: callResultLabel(k), value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const stMap = new Map<string, number>();
  for (const c of clients) stMap.set(c.status, (stMap.get(c.status) ?? 0) + 1);
  const status: NamedValue[] = [...stMap.entries()].map(([k, v]) => ({
    label: clientStatusLabel(k),
    value: v,
  }));

  const rgMap = new Map<string, number>();
  for (const c of clients) {
    const r = c.region ?? "Belgilanmagan";
    rgMap.set(r, (rgMap.get(r) ?? 0) + 1);
  }
  const regions: NamedValue[] = [...rgMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  const active = clients.filter((c) => c.status === "ACTIVE");
  let mrrU = 0, mrrZ = 0;
  for (const c of active) c.currency === "UZS" ? (mrrZ += c.monthlyAmount) : (mrrU += c.monthlyAmount);
  let colU = 0, colZ = 0;
  for (const p of payments) p.currency === "UZS" ? (colZ += p.amount) : (colU += p.amount);
  const overdue = active.filter((c) => paymentState(c.nextPaymentDate) === "OVERDUE");
  let ovU = 0, ovZ = 0;
  for (const c of overdue) c.currency === "UZS" ? (ovZ += c.monthlyAmount) : (ovU += c.monthlyAmount);
  const newClients = clients.filter((c) => c.createdAt >= periodStart).length;

  const pl = kind === "daily" ? "Bugun" : kind === "weekly" ? "Hafta" : "Oy";

  const kpis: KpiTile[] = [
    { label: `Yig'im (${pl.toLowerCase()})`, value: moneyCompact(colU, colZ), accent: "#10b981" },
    { label: "Qo'ng'iroqlar", value: String(pcalls.length), sub: pl },
    { label: "Yangi mijoz", value: String(newClients) },
    { label: "Usta bajardi", value: String(ustaDone) },
    { label: "Faol mijozlar", value: String(active.length), sub: `MRR ${moneyCompact(mrrU, mrrZ)}` },
    { label: "Qarzdorlar", value: String(overdue.length), sub: moneyCompact(ovU, ovZ), accent: "#f43f5e" },
  ];

  const title =
    kind === "daily" ? "Kunlik hisobot" : kind === "weekly" ? "Haftalik hisobot" : "Oylik hisobot";
  const dateLabel =
    kind === "daily" ? tzDateLabel() : `${tzDateLabel(periodStart)} – ${tzDateLabel()}`;
  const caption =
    `📊 <b>${title}</b> — ${dateLabel}\n` +
    `💵 Yig'im: <b>${moneyCompact(colU, colZ)}</b> · 📞 ${pcalls.length} · 🟢 ${newClients} yangi · 🔧 ${ustaDone}`;

  return {
    title,
    dateLabel,
    caption,
    kpis,
    trend: { points: trendPoints, unit: "qo'ng'iroqlar soni", title: `Qo'ng'iroqlar — oxirgi ${N} kun` },
    operators: operatorsItems,
    callResults,
    status,
    regions,
  };
}

/** Grafikli hisobot albomi (rasmlar + caption). */
export async function buildReportAlbum(
  kind: ReportKind,
): Promise<{ caption: string; images: AlbumItem[] }> {
  const d = await gatherChartData(kind);
  const trendSvg = lineChartSvg({ title: d.trend.title, points: d.trend.points, unit: d.trend.unit });
  const list: string[] = [kpiCardSvg({ title: d.title, dateLabel: d.dateLabel, kpis: d.kpis })];

  if (kind === "daily") {
    if (d.operators.length)
      list.push(barChartSvg({ title: "Operatorlar — qo'ng'iroqlar", subtitle: "Bugun", items: d.operators, unit: "ta" }));
    if (d.callResults.length)
      list.push(donutChartSvg({ title: "Qo'ng'iroq natijalari", subtitle: "Bugun", items: d.callResults }));
    list.push(trendSvg);
  } else if (kind === "weekly") {
    list.push(trendSvg);
    if (d.operators.length)
      list.push(barChartSvg({ title: "Operatorlar — qo'ng'iroqlar", subtitle: "Hafta", items: d.operators, unit: "ta" }));
    if (d.status.length) list.push(donutChartSvg({ title: "Mijozlar holati", items: d.status }));
  } else {
    list.push(trendSvg);
    if (d.regions.length)
      list.push(barChartSvg({ title: "Viloyatlar bo'yicha mijozlar", items: d.regions, unit: "ta", color: "#0ea5e9" }));
    if (d.operators.length)
      list.push(barChartSvg({ title: "Operatorlar — qo'ng'iroqlar", subtitle: "Oy", items: d.operators, unit: "ta" }));
  }

  const images: AlbumItem[] = list.map((svg, i) => ({
    png: svgToPng(svg, 1000),
    caption: i === 0 ? d.caption : undefined,
  }));
  return { caption: d.caption, images };
}

// Telegram hisobotlari uchun matn quruvchilar — framework-agnostik (faqat Prisma).
// Next.js va worker (tsx) ikkalasida ham ishlaydi.

import { db } from "./db";
import { formatMoney } from "./utils";
import {
  callResultLabel,
  clientStatusLabel,
  leadProfileLabel,
  profileOrder,
  SHIFT_REPORT,
  TALKED_RESULTS,
  type LeadSegment,
  type UserShift,
} from "./constants";
import { getActiveLeadProfile } from "./settings";
import { classifyLead } from "./lead-segments";
import { paymentState } from "./payment-status";
import { svgToPng } from "./render-image";
import {
  kpiCardSvg,
  barChartSvg,
  donutChartSvg,
  lineChartSvg,
  STATUS,
  type Delta,
  type KpiTile,
  type NamedValue,
} from "./charts/svg";
import { escapeHtml, type AlbumItem } from "./telegram";
// Vaqt mintaqasi yordamchilari yagona manbada (lib/tz.ts) — server+klient uchun.
// Tashqi importlar (bot.ts va h.k.) buzilmasin uchun shu yerdан re-eksport qilamiz.
import {
  TZ_MIN,
  startOfTzDay,
  startOfTzMonth,
  tzDateLabel,
  tzTimeAt,
  tzTimeLabel,
} from "./tz";
export { startOfTzDay, startOfTzMonth, tzDateLabel };

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

export type OperatorLine = {
  name: string;
  calls: number;
  collected: string;
  /** Shu hisobot smenasiga biriktirilganmi (yo'q — boshqa smenadan ishlagan). */
  onShift: boolean;
};

export type PeriodStats = {
  payments: { count: number; sum: Money };
  calls: { count: number; byResult: { label: string; value: number }[] };
  newClients: number;
  ticketsOpened: number;
  ticketsResolved: number;
  ustaDone: number;
  topOperators: { name: string; calls: number; collected: string }[];
  /**
   * Smena hisobotlarida — smenadagi HAMMA xodim (0 qo'ng'iroqlilar ham, aks
   * holda ishlamagan odam ko'rinmay qolardi) + oynada ishlagan boshqa smena
   * xodimlari.
   */
  shiftOperators?: OperatorLine[];
};

// --- Smena oynasi ---

export type ShiftKind = "shift-day" | "shift-night";

export type ShiftWindow = {
  shift: UserShift;
  start: Date;
  end: Date;
  title: string;
  range: string;
};

/** `now` dan oldingi eng yaqin UTC+5 soat:daqiqa. */
function lastAt(hour: number, minute: number, now: Date): Date {
  const t = tzTimeAt(hour, minute, 0, now);
  return t <= now ? t : tzTimeAt(hour, minute, 1, now);
}

/** `from` dan keyingi eng yaqin UTC+5 soat:daqiqa. */
function firstAfter(hour: number, minute: number, from: Date): Date {
  const t = tzTimeAt(hour, minute, 0, from);
  return t > from ? t : tzTimeAt(hour, minute, -1, from);
}

/**
 * Smena hisobotining vaqt oynasi. Sof funksiya (`now` uzatiladi) — cron 17:30 /
 * 09:30 da chaqirganda ham, admin kun o'rtasida qo'lda bosganda ham to'g'ri
 * oynani beradi: boshlanish — o'tgan eng yaqin smena boshi, tugash — smenaning
 * nominal oxiri yoki hozir (qaysi biri oldinroq bo'lsa).
 */
export function shiftWindow(kind: ShiftKind, now = new Date()): ShiftWindow {
  const isDay = kind === "shift-day";
  const from = isDay ? SHIFT_REPORT.DAY : SHIFT_REPORT.NIGHT;
  // Qarama-qarshi smenaning boshlanishi = shu smenaning tugashi.
  const to = isDay ? SHIFT_REPORT.NIGHT : SHIFT_REPORT.DAY;

  const start = lastAt(from.startHour, from.startMinute, now);
  const nominalEnd = firstAfter(to.startHour, to.startMinute, start);
  const end = nominalEnd < now ? nominalEnd : now;

  return {
    shift: isDay ? "DAY" : "NIGHT",
    start,
    end,
    title: isDay ? "Kunduzgi smena hisoboti" : "Kechki smena hisoboti",
    range: `${tzDateLabel(start)} ${tzTimeLabel(start)} – ${tzDateLabel(end)} ${tzTimeLabel(end)}`,
  };
}

/** Berilgan davr uchun ko'rsatkichlarni yig'adi. */
export async function gatherPeriod(
  start: Date,
  end: Date,
  shift?: UserShift,
): Promise<PeriodStats> {
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
        select: { id: true, name: true, role: true, shift: true, isActive: true },
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

  // Smena kesimi: smenadagi barcha faol operator (0 qo'ng'iroqlilar ham) +
  // oynada ishlagan boshqa smena xodimlari.
  let shiftOperators: OperatorLine[] | undefined;
  if (shift) {
    const worked = (id: string) => (callsByOp.get(id) ?? 0) > 0 || payByOp.has(id);
    shiftOperators = operators
      .filter((o) => (o.role === "OPERATOR" && o.isActive && o.shift === shift) || worked(o.id))
      .map((o) => ({
        name: o.name,
        calls: callsByOp.get(o.id) ?? 0,
        collected: money2(payByOp.get(o.id) ?? { USD: 0, UZS: 0 }),
        onShift: o.shift === shift,
      }))
      .sort((a, b) => {
        if (a.onShift !== b.onShift) return a.onShift ? -1 : 1;
        return b.calls - a.calls;
      });
  }

  return {
    payments: { count: payments.length, sum: paySum },
    calls: { count: calls.length, byResult },
    newClients,
    ticketsOpened,
    ticketsResolved,
    ustaDone,
    topOperators,
    shiftOperators,
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
  if (s.shiftOperators) {
    const own = s.shiftOperators.filter((o) => o.onShift);
    const other = s.shiftOperators.filter((o) => !o.onShift);
    lines.push("");
    lines.push(`<b>Smena xodimlari (${own.length}):</b>`);
    if (own.length === 0) lines.push("<i>Bu smenaga xodim biriktirilmagan</i>");
    for (const o of own) {
      lines.push(
        `• ${escapeHtml(o.name)} — ${o.calls} qo'ng'iroq, yig'im ${o.collected}` +
          (o.calls === 0 ? " ⚠️" : ""),
      );
    }
    if (other.length) {
      lines.push("<i>Boshqa smenadan ishlaganlar:</i>");
      for (const o of other) {
        lines.push(`• ${escapeHtml(o.name)} — ${o.calls} qo'ng'iroq, yig'im ${o.collected}`);
      }
    }
  } else if (s.topOperators.length) {
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

/**
 * Kunlik fokus qatori — tanlangan ustuvorlik natijaga ta'sir qildimi degan
 * savolga javob beradi: taqsimotda nechta fokus lidi bor va nechtasi bilan
 * haqiqatan gaplashildi. Fokus segmentlari = ulushi eng katta, jami 50% gacha
 * (OTHERS hisobga olinmaydi — u "qolgani" degani).
 */
async function focusLine(start: Date, end: Date): Promise<string> {
  const active = await getActiveLeadProfile();
  const order = profileOrder(active.id);

  const focusSegments = new Set<LeadSegment>();
  let acc = 0;
  for (const s of [...order].sort((a, b) => b.share - a.share)) {
    if (s.segment === "OTHERS") continue;
    focusSegments.add(s.segment);
    acc += s.share;
    if (acc >= 50) break;
  }

  const assigned = await db.client.findMany({
    where: { status: "ACTIVE", assignedToId: { not: null } },
    select: {
      id: true,
      stage: true,
      createdAt: true,
      nextPaymentDate: true,
      nextContactDate: true,
      lastContactedAt: true,
      missedCallCount: true,
      monthlyAmount: true,
      currency: true,
    },
  });
  const now = new Date();
  const inFocus = assigned.filter((c) => focusSegments.has(classifyLead(c, order, now)));

  let talked = 0;
  if (inFocus.length) {
    const rows = await db.callLog.findMany({
      where: {
        calledAt: { gte: start, lt: end },
        clientId: { in: inFocus.map((c) => c.id) },
        result: { in: TALKED_RESULTS },
      },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    talked = rows.length;
  }

  return (
    `🎯 Fokus: <b>${escapeHtml(leadProfileLabel(active.id))}</b>` +
    (active.todayOnly ? " <i>(faqat bugunga)</i>" : "") +
    ` — taqsimotda ${inFocus.length} ta fokus lidi, ${talked} tasi bilan gaplashildi`
  );
}

/**
 * Smena hisoboti. Kunduzgi hisobotga kunlik fokus qatori qo'shiladi — u ertalab
 * 08:00 dagi taqsimotga tegishli, ya'ni aynan shu smena bilan bir kunda.
 * Kechki hisobotda fokus KO'RSATILMAYDI: u 09:30 da yuboriladi, o'shanda joriy
 * profil allaqachon yangi kunga qayta hisoblangan bo'ladi va tungi ish bilan
 * mos kelmasdi.
 */
export async function buildShiftReport(kind: ShiftKind): Promise<string> {
  const w = shiftWindow(kind);
  const [stats, snap, focus] = await Promise.all([
    gatherPeriod(w.start, w.end, w.shift),
    snapshot(),
    kind === "shift-day" ? focusLine(w.start, w.end) : Promise.resolve(null),
  ]);
  return (
    `📊 <b>${w.title}</b>\n<i>${w.range}</i>\n\n` +
    (focus ? `${focus}\n\n` : "") +
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

export type ReportKind = ShiftKind | "weekly" | "monthly";

export function isShiftKind(kind: ReportKind): kind is ShiftKind {
  return kind === "shift-day" || kind === "shift-night";
}

export async function buildReport(kind: ReportKind): Promise<string> {
  if (kind === "weekly") return buildWeeklyReport();
  if (kind === "monthly") return buildMonthlyReport();
  return buildShiftReport(kind);
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

/** Joriy va oldingi davr sonlarini solishtirib delta chip qaytaradi (avvalgi 0 → yo'q). */
function pctDelta(cur: number, prev: number, higherIsGood = true): Delta | undefined {
  if (prev <= 0) return undefined;
  const change = Math.round(((cur - prev) / prev) * 100);
  if (change === 0) return { dir: "flat", text: "0%", good: true };
  const dir: Delta["dir"] = change > 0 ? "up" : "down";
  const good = higherIsGood ? change > 0 : change < 0;
  return { dir, text: `${Math.abs(change)}%`, good };
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
  const win = isShiftKind(kind) ? shiftWindow(kind) : null;
  const periodStart =
    win?.start ?? (kind === "weekly" ? startOfTzDay(6) : startOfTzMonth());
  // Smena oynasi yopiq bo'lishi mumkin (masalan tugagan smena hisoboti qo'lda
  // so'ralsa) — shuning uchun yuqori chegara ham hisobga olinadi.
  const periodEnd = win?.end ?? new Date();
  const trendStart = buckets[0].start < periodStart ? buckets[0].start : periodStart;

  // Oldingi (teng uzunlikdagi) davr — delta solishtiruvi uchun
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const prevStart = new Date(periodStart.getTime() - periodMs);
  const prevEnd = periodStart;

  const [calls, payments, clients, operators, ustaDone, prevCalls, openTickets] =
    await Promise.all([
    db.callLog.findMany({
      where: { calledAt: { gte: trendStart } },
      select: { calledAt: true, result: true, operatorId: true },
    }),
    db.payment.findMany({
      where: { paidAt: { gte: periodStart, lt: periodEnd } },
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
    db.client.count({
      where: { ustaStatus: "DONE", updatedAt: { gte: periodStart, lt: periodEnd } },
    }),
    db.callLog.count({ where: { calledAt: { gte: prevStart, lt: prevEnd } } }),
    db.ticket.count({ where: { status: { not: "RESOLVED" } } }),
  ]);

  const trendPoints: NamedValue[] = buckets.map((b) => ({
    label: b.label,
    value: calls.filter((c) => c.calledAt >= b.start && c.calledAt < b.end).length,
  }));

  const pcalls = calls.filter((c) => c.calledAt >= periodStart && c.calledAt < periodEnd);

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
  const newClients = clients.filter(
    (c) => c.createdAt >= periodStart && c.createdAt < periodEnd,
  ).length;
  const prevNew = clients.filter((c) => c.createdAt >= prevStart && c.createdAt < prevEnd).length;

  // Gaplashildi (real aloqa) foizi
  const talked = pcalls.filter((c) => TALKED_RESULTS.includes(c.result)).length;
  const talkRate = pcalls.length ? Math.round((talked / pcalls.length) * 100) : 0;

  const pl = win
    ? win.shift === "DAY"
      ? "Kunduzgi smena"
      : "Kechki smena"
    : kind === "weekly"
      ? "Hafta"
      : "Oy";

  const kpis: KpiTile[] = [
    { label: `Yig'im (${pl.toLowerCase()})`, value: moneyCompact(colU, colZ), accent: STATUS.good },
    {
      label: "Qo'ng'iroqlar",
      value: String(pcalls.length),
      sub: pl,
      delta: pctDelta(pcalls.length, prevCalls),
    },
    { label: "Gaplashildi", value: `${talkRate}%`, sub: `${talked} / ${pcalls.length}` },
    { label: "Yangi mijoz", value: String(newClients), delta: pctDelta(newClients, prevNew) },
    { label: "Faol mijozlar", value: String(active.length), sub: `MRR ${moneyCompact(mrrU, mrrZ)}` },
    {
      label: "Qarzdorlar",
      value: String(overdue.length),
      sub: moneyCompact(ovU, ovZ),
      accent: STATUS.bad,
    },
    { label: "Usta bajardi", value: String(ustaDone) },
    { label: "Ochiq muammolar", value: String(openTickets), accent: STATUS.warn },
  ];

  const title = win
    ? win.title
    : kind === "weekly"
      ? "Haftalik hisobot"
      : "Oylik hisobot";
  const dateLabel = win ? win.range : `${tzDateLabel(periodStart)} – ${tzDateLabel()}`;
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

  if (isShiftKind(kind)) {
    const sub = kind === "shift-day" ? "Kunduzgi smena" : "Kechki smena";
    if (d.operators.length)
      list.push(barChartSvg({ title: "Operatorlar — qo'ng'iroqlar", subtitle: sub, items: d.operators, unit: "ta" }));
    if (d.callResults.length)
      list.push(donutChartSvg({ title: "Qo'ng'iroq natijalari", subtitle: sub, items: d.callResults }));
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

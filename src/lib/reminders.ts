// Avtomatik eslatmalar: operatorlarga kunlik qayta-aloqa + qarzdorlik ro'yxati,
// boshliq/adminlarga umumiy holat ogohlantirishi (Telegram DM). Worker (cron) va
// server action (qo'lda) shu funksiyalarni ishlatadi.

import { startOfDay, endOfDay } from "date-fns";
import { db } from "@/lib/db";
import { sendMessage, sendToChannel, escapeHtml } from "@/lib/telegram";
import { formatMoney, formatPhone } from "@/lib/utils";
import { ACTIVE_STAGES, LEAD_LIMITS, leadOutcomeLabel } from "@/lib/constants";

type Money = { USD: number; UZS: number };
function money2(m: Money): string {
  const p: string[] = [];
  if (m.USD > 0) p.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) p.push(formatMoney(m.UZS, "UZS"));
  return p.length ? p.join(" + ") : "0";
}
function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86400000));
}

const CALLBACK_CAP = 25;
const DEBT_CAP = 15;

export type ReminderSummary = {
  operators: { sent: number; skipped: number; noTelegram: number };
  managers: { sent: number; mode: "dm" | "channel" | "none" };
};

/** Bitta operator uchun bugungi eslatma matni (qayta-aloqa + qarzdorlik). null = yuborishga arzimaydi. */
export async function buildOperatorReminder(
  operatorId: string,
  operatorName: string,
): Promise<string | null> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [callbacks, overdue] = await Promise.all([
    db.client.findMany({
      where: {
        assignedToId: operatorId,
        status: "ACTIVE",
        stage: { in: ACTIVE_STAGES as unknown as string[] },
        nextContactDate: { lte: todayEnd },
      },
      orderBy: { nextContactDate: "asc" },
      select: { restaurantName: true, fullName: true, phone: true, lastOutcome: true },
    }),
    db.client.findMany({
      where: {
        assignedToId: operatorId,
        status: "ACTIVE",
        nextPaymentDate: { lt: todayStart },
      },
      orderBy: { nextPaymentDate: "asc" },
      select: { restaurantName: true, fullName: true, monthlyAmount: true, currency: true, nextPaymentDate: true },
    }),
  ]);

  if (callbacks.length === 0 && overdue.length === 0) return null;

  const dateStr = now.toLocaleDateString("uz-UZ", { day: "2-digit", month: "long" });
  const lines: string[] = [`🔔 <b>Bugungi ish</b> — ${escapeHtml(dateStr)}`, ""];

  if (callbacks.length) {
    lines.push(`📞 <b>Qayta aloqa</b> (${callbacks.length} ta):`);
    callbacks.slice(0, CALLBACK_CAP).forEach((c, i) => {
      const out = c.lastOutcome ? ` — ${escapeHtml(leadOutcomeLabel(c.lastOutcome))}` : "";
      const name = escapeHtml(c.restaurantName || c.fullName || "—");
      lines.push(`${i + 1}. ${name} — ${formatPhone(c.phone)}${out}`);
    });
    if (callbacks.length > CALLBACK_CAP) lines.push(`… yana ${callbacks.length - CALLBACK_CAP} ta`);
    lines.push("");
  }

  if (overdue.length) {
    const debt: Money = { USD: 0, UZS: 0 };
    for (const c of overdue) debt[c.currency === "UZS" ? "UZS" : "USD"] += c.monthlyAmount;
    lines.push(`💰 <b>Muddati o'tgan to'lov</b> (${overdue.length} ta — ${money2(debt)}):`);
    overdue.slice(0, DEBT_CAP).forEach((c) => {
      const d = c.nextPaymentDate ? daysBetween(now, c.nextPaymentDate) : 0;
      lines.push(`• ${escapeHtml(c.restaurantName || c.fullName || "—")} — ${formatMoney(c.monthlyAmount, c.currency)} (${d} kun)`);
    });
    if (overdue.length > DEBT_CAP) lines.push(`… yana ${overdue.length - DEBT_CAP} ta`);
    lines.push("");
  }

  lines.push(`Kunlik norma: ${LEAD_LIMITS.daily} ta gaplashish. Omad! 💪`);
  return lines.join("\n");
}

/** Barcha faol operatorlarga (telegramId bor) kunlik eslatma yuboradi. */
export async function sendOperatorReminders(): Promise<ReminderSummary["operators"]> {
  const operators = await db.user.findMany({
    where: { role: "OPERATOR", isActive: true },
    select: { id: true, name: true, telegramId: true },
  });

  let sent = 0,
    skipped = 0,
    noTelegram = 0;
  for (const op of operators) {
    if (!op.telegramId) {
      noTelegram++;
      continue;
    }
    const msg = await buildOperatorReminder(op.id, op.name);
    if (!msg) {
      skipped++;
      continue;
    }
    const res = await sendMessage(op.telegramId, msg);
    if (res.ok) sent++;
    else skipped++;
  }
  return { sent, skipped, noTelegram };
}

/** Boshliq/admin uchun umumiy holat matni. */
export async function buildManagerSummary(): Promise<string> {
  const now = new Date();
  const todayStart = startOfDay(now);

  const [escalated, overdue, unassigned, pendingReturns, missed, operators, callsByOp] =
    await Promise.all([
      db.client.count({ where: { stage: "ESCALATED" } }),
      db.client.findMany({
        where: { status: "ACTIVE", nextPaymentDate: { lt: todayStart } },
        select: { monthlyAmount: true, currency: true },
      }),
      db.client.count({ where: { assignedToId: null } }),
      db.equipmentReturnRequest.count({ where: { status: "PENDING" } }),
      db.client.count({ where: { status: "ACTIVE", missedCallCount: { gte: 3 } } }),
      db.user.findMany({
        where: { role: "OPERATOR", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.callLog.groupBy({
        by: ["operatorId"],
        where: { calledAt: { gte: todayStart }, result: "TALKED", operatorId: { not: null } },
        _count: true,
      }),
    ]);

  const debt: Money = { USD: 0, UZS: 0 };
  for (const c of overdue) debt[c.currency === "UZS" ? "UZS" : "USD"] += c.monthlyAmount;

  const talkedByOp = new Map(callsByOp.map((g) => [g.operatorId, g._count]));
  const dateStr = now.toLocaleDateString("uz-UZ", { day: "2-digit", month: "long" });

  const lines: string[] = [
    `📊 <b>Kunlik holat</b> — ${escapeHtml(dateStr)}`,
    "",
    `⚠️ Eskalatsiya navbati: <b>${escalated}</b>`,
    `💰 Muddati o'tgan to'lov: <b>${overdue.length}</b> mijoz — ${money2(debt)}`,
    `📵 3+ marta ko'tarilmagan: <b>${missed}</b>`,
    `🆕 Biriktirilmagan mijoz: <b>${unassigned}</b>`,
    `📦 Kutilayotgan uskuna qaytarish: <b>${pendingReturns}</b>`,
    "",
    `<b>Bugun gaplashildi</b> (limit ${LEAD_LIMITS.daily}):`,
    ...operators.map((o) => `• ${escapeHtml(o.name)}: ${talkedByOp.get(o.id) ?? 0}`),
  ];
  return lines.join("\n");
}

/** Boshliq/adminlarga (telegramId) DM, bo'lmasa kanalga yuboradi. */
export async function sendManagerAlerts(): Promise<ReminderSummary["managers"]> {
  const msg = await buildManagerSummary();
  const managers = await db.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true, telegramId: { not: null } },
    select: { telegramId: true },
  });

  if (managers.length === 0) {
    const res = await sendToChannel(msg);
    return { sent: res.ok ? 1 : 0, mode: res.ok ? "channel" : "none" };
  }
  let sent = 0;
  for (const m of managers) {
    if (!m.telegramId) continue;
    const res = await sendMessage(m.telegramId, msg);
    if (res.ok) sent++;
  }
  return { sent, mode: "dm" };
}

/** Kunlik eslatmalarning hammasi (operator + boshliq). */
export async function sendDailyReminders(): Promise<ReminderSummary> {
  const operators = await sendOperatorReminders();
  const managers = await sendManagerAlerts();
  return { operators, managers };
}

// Matnli kunlik hisobot (rahbarga topshirish uchun) — SODDA MATN, HTML/grafik yo'q.
// Grafikli Telegram hisobotidan (reports.ts) mustaqil: og'ir bog'liqliklarni
// (resvg/charts/telegram) tortmaydi, shu bois oddiy server sahifasida ishlatsa bo'ladi.

import { db } from "./db";
import { formatMoney } from "./utils";
import { paymentState } from "./payment-status";
import { startOfTzDay, tzDateLabel } from "./tz";

type Money = { USD: number; UZS: number };
function add(m: Money, cur: string, amt: number) {
  m[cur === "UZS" ? "UZS" : "USD"] += amt;
}
function money2(m: Money): string {
  const p: string[] = [];
  if (m.USD > 0) p.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) p.push(formatMoney(m.UZS, "UZS"));
  return p.length ? p.join(" + ") : "0";
}

/**
 * Rahbarga topshirish uchun kunlik hisobot — sodda matn (nusxalab yuborsa bo'ladi).
 * Mijozlar bazasi (jami/faol/otkaz/...), bugungi faoliyat va moliya kesimi.
 */
export async function buildManagerTextReport(): Promise<string> {
  const start = startOfTzDay(0); // bugun boshi (UTC+5)
  const end = new Date();

  const [clients, payments, calls, newToday, ticketsOpened, ticketsResolved, ustaDone, openTickets] =
    await Promise.all([
      db.client.findMany({
        select: { status: true, stage: true, currency: true, monthlyAmount: true, nextPaymentDate: true },
      }),
      db.payment.findMany({
        where: { paidAt: { gte: start, lt: end } },
        select: { amount: true, currency: true },
      }),
      db.callLog.count({ where: { calledAt: { gte: start, lt: end } } }),
      db.client.count({ where: { createdAt: { gte: start, lt: end } } }),
      db.ticket.count({ where: { createdAt: { gte: start, lt: end } } }),
      db.ticket.count({ where: { resolvedAt: { gte: start, lt: end } } }),
      db.client.count({ where: { ustaStatus: "DONE", updatedAt: { gte: start, lt: end } } }),
      db.ticket.count({ where: { status: { not: "RESOLVED" } } }),
    ]);

  const active = clients.filter((c) => c.status === "ACTIVE");
  const refused = clients.filter((c) => c.stage === "REFUSED").length; // otkaz (bekor qilgan)
  const pending = clients.filter((c) => c.status === "PENDING").length;
  const inactive = clients.filter((c) => c.status === "INACTIVE").length;

  const mrr: Money = { USD: 0, UZS: 0 };
  for (const c of active) add(mrr, c.currency, c.monthlyAmount);

  const paySum: Money = { USD: 0, UZS: 0 };
  for (const p of payments) add(paySum, p.currency, p.amount);

  const overdue = active.filter((c) => paymentState(c.nextPaymentDate) === "OVERDUE");
  const overdueSum: Money = { USD: 0, UZS: 0 };
  for (const c of overdue) add(overdueSum, c.currency, c.monthlyAmount);

  const L: string[] = [];
  L.push(`KUNLIK HISOBOT — ${tzDateLabel()}`);
  L.push("");
  L.push("MIJOZLAR BAZASI");
  L.push(`• Jami mijozlar: ${clients.length}`);
  L.push(`• Faol: ${active.length}`);
  L.push(`• Otkaz (bekor qilgan): ${refused}`);
  L.push(`• Kutilmoqda: ${pending}`);
  L.push(`• O'chirilgan: ${inactive}`);
  L.push("");
  L.push("BUGUN");
  L.push(`• Yig'im: ${money2(paySum)} (${payments.length} ta to'lov)`);
  L.push(`• Qo'ng'iroqlar: ${calls}`);
  L.push(`• Yangi mijoz: ${newToday}`);
  L.push(`• Usta bajardi: ${ustaDone}`);
  L.push(`• Muammo: +${ticketsOpened} ochildi / ${ticketsResolved} hal qilindi`);
  L.push("");
  L.push("MOLIYA");
  L.push(`• MRR (oylik daromad): ${money2(mrr)}`);
  L.push(`• Qarzdorlar: ${overdue.length} (${money2(overdueSum)})`);
  L.push(`• Ochiq muammolar: ${openTickets}`);

  return L.join("\n");
}

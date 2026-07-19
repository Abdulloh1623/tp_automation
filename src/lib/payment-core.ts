// To'lov yozishning yagona manbasi: chek saqlash + DB + mijoz yangilash +
// kanal + audit. Server action EMAS (shuning uchun tashqaridan chaqirib
// bo'lmaydi) — `actions/payments.ts` va `actions/pending-payments.ts` shu
// funksiyani ishlatadi, natijada ikkala yo'l bir xil billing/audit qoidasiga
// bo'ysunadi.
import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { saveReceipt } from "@/lib/receipts";
import { sendPaymentToChannel, escapeHtml } from "@/lib/telegram";
import { formatMoney, formatDate } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { PAYMENT_METHOD, type PaymentMethod } from "@/lib/constants";
import type { SessionPayload } from "@/lib/session";

export type PaymentFields = {
  amount: number;
  currency: string;
  days: number;
  method: string;
  paidAt?: string;
  receiptNote?: string;
};

/** To'lov kanali uchun caption — mijozning to'liq ma'lumoti + summa + sana. */
export function paymentCaption(
  client: {
    restaurantName: string;
    fullName: string;
    phone: string;
    region: string | null;
    contractNumber: string | null;
    phones: { label: string; number: string }[];
  },
  p: {
    amount: number;
    currency: string;
    days: number;
    method: string;
    paidAt: Date;
    nextPaymentDate: Date;
    operatorName: string;
    note?: string | null;
  },
): string {
  return [
    "💰 <b>Yangi to'lov</b>",
    `🏪 ${escapeHtml(client.restaurantName)}`,
    `👤 ${escapeHtml(client.fullName)}`,
    `📞 ${escapeHtml(client.phone)}`,
    ...client.phones.map((ph) => `   ${escapeHtml(ph.label)}: ${escapeHtml(ph.number)}`),
    client.region ? `📍 ${escapeHtml(client.region)}` : null,
    client.contractNumber ? `📄 Shartnoma: ${escapeHtml(client.contractNumber)}` : null,
    `💵 To'lov: <b>${formatMoney(p.amount, p.currency)}</b>${p.days !== 30 ? ` (${p.days} kun)` : ""}`,
    `💳 Usul: ${PAYMENT_METHOD[p.method as PaymentMethod] ?? p.method}`,
    `📅 Sana: ${formatDate(p.paidAt)}`,
    `🔜 Keyingi to'lov: ${formatDate(p.nextPaymentDate)}`,
    `🧾 Qabul qildi: ${escapeHtml(p.operatorName)}`,
    p.note ? `📝 ${escapeHtml(p.note)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** To'lovni yozadi: chek saqlash + DB + mijoz yangilash + kanal + audit. */
export async function processPayment(
  session: SessionPayload,
  clientId: string,
  fields: PaymentFields,
  receipt: { buffer: Buffer; mime: string },
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { phones: { orderBy: { createdAt: "asc" } } },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const { amount, currency, days } = fields;
  const paidAt = fields.paidAt ? new Date(fields.paidAt) : new Date();
  const now = new Date();
  const base =
    client.nextPaymentDate && client.nextPaymentDate > now ? client.nextPaymentDate : now;
  const nextPaymentDate = addDays(base, days);

  const payment = await db.payment.create({
    data: {
      clientId,
      amount,
      currency,
      paidAt,
      periodStart: base,
      periodEnd: nextPaymentDate,
      method: fields.method,
      receiptNote: fields.receiptNote ?? null,
      recordedById: session.userId,
    },
  });

  const saved = await saveReceipt(receipt.buffer, receipt.mime, payment.id);
  if (!saved.ok) {
    // chek saqlanmasa to'lovni bekor qilamiz (atomarlikka yaqin)
    await db.payment.delete({ where: { id: payment.id } });
    return { ok: false, error: saved.error };
  }
  await db.payment.update({
    where: { id: payment.id },
    data: { receiptPath: saved.relPath },
  });

  await db.client.update({
    where: { id: clientId },
    data: { nextPaymentDate, status: "ACTIVE" },
  });

  await logAudit("To'lov qabul qilindi", {
    entity: "Client",
    entityId: clientId,
    detail: `${client.restaurantName}: ${formatMoney(amount, currency)}`,
  });

  const caption = paymentCaption(client, {
    amount,
    currency,
    days,
    method: fields.method,
    paidAt,
    nextPaymentDate,
    operatorName: session.name,
    note: fields.receiptNote,
  });
  await sendPaymentToChannel(caption, receipt.buffer, receipt.mime);

  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/mijozlar");
  revalidatePath("/tolovlar");
  revalidatePath("/");
  return { ok: true, paymentId: payment.id };
}

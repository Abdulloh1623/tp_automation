// To'lov yozishning yagona manbasi: chek saqlash + DB + mijoz yangilash +
// kanal + audit. Server action EMAS (shuning uchun tashqaridan chaqirib
// bo'lmaydi) — `actions/payments.ts` va `actions/pending-payments.ts` shu
// funksiyani ishlatadi, natijada ikkala yo'l bir xil billing/audit qoidasiga
// bo'ysunadi.
import { addDays } from "date-fns";
import { revalidatePaymentSurfaces } from "@/lib/revalidate";
import { db } from "@/lib/db";
import { saveReceipt } from "@/lib/receipts";
import { sendPaymentToChannel, escapeHtml } from "@/lib/telegram";
import { formatMoney, formatDate } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { nextPaymentAfterDelete } from "@/lib/billing";
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

export type PaymentOptions = {
  /**
   * TARIXIY rejim (guruh eksportidan import qilingan eski cheklar).
   *
   * Odatdagi to'lovda qamrov "bugundan" boshlanadi va mijozning
   * `nextPaymentDate` si oldinga suriladi. Uch oy oldingi chekni shu yo'l
   * bilan yozsak, mijozning to'lov sanasi noto'g'ri surilib ketadi.
   *
   * Shuning uchun tarixiy rejimda:
   *   - qamrov chekning HAQIQIY sanasidan boshlanadi (paidAt),
   *   - mijozning `nextPaymentDate`/`status` ga TEGILMAYDI,
   *   - kanalga xabar yuborilmaydi (eski to'lovlar bilan spam qilmaymiz).
   * Barcha tarixiy to'lovlar kiritilgach sana bir marta qayta hisoblanadi
   * (`recalculateNextPayment`).
   */
  historical?: boolean;
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
  options: PaymentOptions = {},
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { phones: { orderBy: { createdAt: "asc" } } },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const { amount, currency, days } = fields;
  const paidAt = fields.paidAt ? new Date(fields.paidAt) : new Date();
  const now = new Date();
  // Tarixiy: qamrov chekning o'z sanasidan. Odatiy: bugundan (yoki mavjud
  // qamrov tugaydigan sanadan, agar u kelajakda bo'lsa).
  const base = options.historical
    ? paidAt
    : client.nextPaymentDate && client.nextPaymentDate > now
      ? client.nextPaymentDate
      : now;
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

  // Tarixiy to'lov mijozning joriy holatiga tegmaydi — sana import oxirida
  // `recalculateNextPayment` bilan bir marta qayta hisoblanadi.
  if (!options.historical) {
    await db.client.update({
      where: { id: clientId },
      data: { nextPaymentDate, status: "ACTIVE" },
    });
  }

  await logAudit(
    options.historical ? "Tarixiy to'lov import qilindi" : "To'lov qabul qilindi",
    {
      entity: "Client",
      entityId: clientId,
      detail: `${client.restaurantName}: ${formatMoney(amount, currency)}`,
      // Aktyor aniq beriladi — bu funksiya worker'dan (bot tasdig'i) ham
      // chaqiriladi, u yerda sessiya (cookie) yo'q.
      actor: { userId: session.userId, name: session.name },
    },
  );

  // Eski to'lovlarni kanalga yubormaymiz — jamoani spam qilmaslik uchun
  if (!options.historical) {
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
  }

  revalidatePaymentSurfaces(clientId);
  return { ok: true, paymentId: payment.id };
}

/** Bitta mijoz uchun to'lov sanasini qayta hisoblash rejasi. */
export type NextPaymentPlanRow = {
  clientId: string;
  restaurantName: string;
  current: Date | null;
  next: Date;
  /** forward — sana oldinga suriladi; backward — orqaga; same — o'zgarmaydi. */
  direction: "forward" | "backward" | "same";
};

/**
 * Mijozlarning keyingi to'lov sanasini to'lovlar tarixidan QAYTA HISOBLAYDI,
 * lekin YOZMAYDI — faqat rejani qaytaradi.
 *
 * Mantiq `nextPaymentAfterDelete` bilan bir xil (billing.ts — yagona manba):
 * eng oxirgi to'lovning `periodEnd`i, to'lov bo'lmasa shartnoma sanasidan.
 *
 * DIQQAT — `backward` qatorlarga ehtiyot bo'ling: guruh eksporti mijozning
 * BUTUN to'lov tarixini qamrab olmaydi (guruh qachondir boshlangan). Shuning
 * uchun tarixdan hisoblangan sana hozirgisidan oldinroq chiqishi mumkin —
 * bu to'lovi joyida mijozni qarzdorga aylantiradi. Ko'rib chiqmasdan
 * qo'llamang.
 */
export async function planNextPayment(clientIds: string[]): Promise<NextPaymentPlanRow[]> {
  const plan: NextPaymentPlanRow[] = [];
  for (const clientId of clientIds) {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: {
        restaurantName: true,
        contractDate: true,
        createdAt: true,
        nextPaymentDate: true,
      },
    });
    if (!client) continue;

    const latest = await db.payment.findFirst({
      where: { clientId },
      orderBy: { periodEnd: "desc" },
      select: { periodEnd: true },
    });

    const anchor = client.contractDate ?? client.createdAt;
    const next = nextPaymentAfterDelete(latest?.periodEnd, anchor);
    const cur = client.nextPaymentDate;

    const direction: NextPaymentPlanRow["direction"] =
      !cur || cur.getTime() === next.getTime()
        ? cur
          ? "same"
          : "forward"
        : next > cur
          ? "forward"
          : "backward";

    plan.push({
      clientId,
      restaurantName: client.restaurantName,
      current: cur,
      next,
      direction,
    });
  }
  return plan;
}

/**
 * Rejani qo'llaydi. `same` qatorlar o'tkazib yuboriladi.
 * @returns yozilgan mijozlar soni
 */
export async function applyNextPaymentPlan(plan: NextPaymentPlanRow[]): Promise<number> {
  let changed = 0;
  for (const row of plan) {
    if (row.direction === "same") continue;
    await db.client.update({
      where: { id: row.clientId },
      data: { nextPaymentDate: row.next },
    });
    changed++;
  }
  return changed;
}

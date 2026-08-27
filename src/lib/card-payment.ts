// Karta/QR to'lovini tasdiqlash oqimi — yagona manba.
//
// NEGA: karta orqali to'langan pul HAQIQATAN kartaga tushganini faqat kartaga
// dostupi bor odam ko'ra oladi. Shu sabab bunday to'lov darhol yozilmaydi:
// avval `PendingCardPayment` yoziladi, tasdiqlovchi(lar)ga bot orqali chek +
// summa + vaqt yuboriladi va faqat tasdiqlangach haqiqiy `Payment` yaratiladi
// (billing o'shanda suriladi). Rad etilsa to'lov qabul qilinmaydi va operator
// bilan adminlarga bildirishnoma boradi.
//
// Bu modul HAM ilovadan (server action), HAM worker'dan (Telegram bot callback)
// chaqiriladi — shuning uchun `next/headers` (sessiya) ishlatilmaydi, aktyor
// har doim aniq beriladi.
import { db } from "./db";
import { readReceipt, deleteReceipt, saveReceipt } from "./receipts";
import { processPayment } from "./payment-core";
import { createNotification } from "./notifications";
import {
  escapeHtml,
  sendMessage,
  sendApprovalRequest,
  clearInlineKeyboard,
  type InlineButton,
} from "./telegram";
import { formatMoney, formatDate } from "./utils";
import { tzTimeLabel } from "./tz";
import {
  CARD_CONFIRM_METHODS,
  CARD_REJECT_REASON,
  cardRejectReasonLabel,
  paymentMethodLabel,
} from "./constants";
import { logAudit } from "./audit";
import { safeRevalidate } from "./revalidate";
import type { SessionPayload } from "./session";

export type Actor = { userId: string; name: string };
export type CardResult = { ok: true; paymentId?: string } | { ok: false; error: string };

/** Shu usuldagi to'lov karta egasi tasdig'idan o'tadimi? */
export function needsCardConfirmation(method: string | null | undefined): boolean {
  return !!method && (CARD_CONFIRM_METHODS as readonly string[]).includes(method);
}

/** Telegramga ulangan, karta to'lovini tasdiqlay oladigan xodimlar. */
export async function listCardVerifiers(): Promise<
  { id: string; name: string; telegramId: string }[]
> {
  const users = await db.user.findMany({
    where: { cardVerifier: true, isActive: true, telegramId: { not: null } },
    select: { id: true, name: true, telegramId: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name, telegramId: u.telegramId! }));
}

/** Tasdiqlovchiga yuboriladigan xabar matni (sof funksiya — test qilinadi). */
export function cardRequestCaption(req: {
  restaurantName: string;
  fullName: string;
  phone: string;
  amount: number;
  currency: string;
  method: string;
  paidAt: Date;
  operatorName: string;
  note?: string | null;
}): string {
  return [
    "💳 <b>Karta to'lovini tasdiqlang</b>",
    `🏪 ${escapeHtml(req.restaurantName)}`,
    `👤 ${escapeHtml(req.fullName)}`,
    `📞 ${escapeHtml(req.phone)}`,
    `💵 Summa: <b>${formatMoney(req.amount, req.currency)}</b>`,
    `💳 Usul: ${paymentMethodLabel(req.method)}`,
    `🕒 Vaqt: ${formatDate(req.paidAt)} ${tzTimeLabel(req.paidAt)}`,
    `🧾 Kiritdi: ${escapeHtml(req.operatorName)}`,
    req.note ? `📝 ${escapeHtml(req.note)}` : null,
    "",
    "Pul kartaga tushganini tekshirib, javob bering:",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function approveButtons(id: string): InlineButton[][] {
  return [
    [
      { text: "✅ Tasdiqlash", callback_data: `cardpay:ok:${id}` },
      { text: "❌ Rad etish", callback_data: `cardpay:no:${id}` },
    ],
  ];
}

/** Rad etish sababini so'raydigan tugmalar. */
export function rejectReasonButtons(id: string): InlineButton[][] {
  return [
    ...Object.entries(CARD_REJECT_REASON).map(([code, label]) => [
      { text: label, callback_data: `cardpay:no:${id}:${code}` },
    ]),
    [{ text: "⬅️ Orqaga", callback_data: `cardpay:back:${id}` }],
  ];
}

export { approveButtons };

type TgRef = { chatId: string; messageId: number };

function parseTgRefs(raw: string | null): TgRef[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as TgRef[]) : [];
  } catch {
    return [];
  }
}

/**
 * Tasdiqlash so'rovini yaratadi: chekni saqlaydi, navbatga yozadi va
 * tasdiqlovchilarga bot orqali yuboradi.
 *
 * Tasdiqlovchi umuman sozlanmagan bo'lsa `{ ok:false, noVerifier:true }`
 * qaytadi — chaqiruvchi (actions/payments.ts) bunday holatda to'lovni
 * ODATDAGIDEK yozadi. Aks holda sozlanmagan tizimda to'lovlar abadiy
 * "kutilmoqda" holatida osilib qolardi.
 */
export async function createCardConfirmationRequest(input: {
  clientId: string;
  amount: number;
  currency: string;
  days: number;
  method: string;
  paidAt?: string;
  receiptNote?: string;
  receipt: { buffer: Buffer; mime: string };
  actor: Actor;
}): Promise<{ ok: true; id: string; verifiers: number } | { ok: false; error: string; noVerifier?: boolean }> {
  const verifiers = await listCardVerifiers();
  if (verifiers.length === 0) {
    return { ok: false, error: "Karta to'lovini tasdiqlovchi sozlanmagan", noVerifier: true };
  }

  const client = await db.client.findUnique({
    where: { id: input.clientId },
    select: { restaurantName: true, fullName: true, phone: true },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const req = await db.pendingCardPayment.create({
    data: {
      clientId: input.clientId,
      amount: input.amount,
      currency: input.currency,
      days: input.days,
      method: input.method,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      receiptNote: input.receiptNote ?? null,
      receiptMime: input.receipt.mime,
      recordedById: input.actor.userId,
    },
  });

  const saved = await saveReceipt(input.receipt.buffer, input.receipt.mime, `card-${req.id}`);
  if (!saved.ok) {
    await db.pendingCardPayment.delete({ where: { id: req.id } });
    return { ok: false, error: saved.error };
  }
  await db.pendingCardPayment.update({
    where: { id: req.id },
    data: { receiptPath: saved.relPath },
  });

  const caption = cardRequestCaption({
    ...client,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    paidAt: req.paidAt,
    operatorName: input.actor.name,
    note: input.receiptNote,
  });

  const refs: TgRef[] = [];
  for (const v of verifiers) {
    const res = await sendApprovalRequest(
      v.telegramId,
      caption,
      input.receipt,
      approveButtons(req.id),
    );
    if (res.ok && res.result?.message_id) {
      refs.push({ chatId: v.telegramId, messageId: res.result.message_id });
    }
  }

  await db.pendingCardPayment.update({
    where: { id: req.id },
    data: { tgMessages: JSON.stringify(refs), notifiedAt: refs.length ? new Date() : null },
  });

  await logAudit("Karta to'lovi tasdiqqa yuborildi", {
    entity: "Client",
    entityId: input.clientId,
    detail: `${client.restaurantName}: ${formatMoney(input.amount, input.currency)}`,
    actor: { userId: input.actor.userId, name: input.actor.name },
  });

  safeRevalidate("/tolovlar");
  return { ok: true, id: req.id, verifiers: refs.length };
}

/** Barcha yuborilgan xabarlardagi tugmalarni olib tashlaydi va natijani yozadi. */
async function closeTelegramMessages(raw: string | null, outcome: string): Promise<void> {
  for (const ref of parseTgRefs(raw)) {
    await clearInlineKeyboard(ref.chatId, ref.messageId);
    await sendMessage(ref.chatId, outcome);
  }
}

/**
 * So'rovni hal qiladi: tasdiqlansa haqiqiy to'lov yaratiladi, rad etilsa
 * operator + adminlarga bildirishnoma boradi.
 *
 * Bir vaqtda ikki tasdiqlovchi bosishiga yo'l qo'ymaslik uchun status
 * `updateMany` bilan band qilinadi (optimistik qulf).
 */
export async function resolveCardPayment(
  requestId: string,
  opts: { approve: boolean; actor: Actor; via: "TELEGRAM" | "WEB"; reason?: string },
): Promise<CardResult> {
  const req = await db.pendingCardPayment.findUnique({
    where: { id: requestId },
    include: {
      client: { select: { id: true, restaurantName: true, fullName: true } },
      recordedBy: { select: { id: true, name: true, username: true, role: true, telegramId: true } },
    },
  });
  if (!req) return { ok: false, error: "So'rov topilmadi" };
  if (req.status !== "PENDING") return { ok: false, error: "Bu to'lov allaqachon ko'rib chiqilgan" };

  const claimed = await db.pendingCardPayment.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: opts.approve ? "CONFIRMED" : "REJECTED",
      resolvedById: opts.actor.userId,
      resolvedAt: new Date(),
      resolvedVia: opts.via,
      rejectReason: opts.approve ? null : (opts.reason ?? null),
    },
  });
  if (claimed.count === 0) return { ok: false, error: "Bu to'lov allaqachon ko'rib chiqilgan" };

  const money = formatMoney(req.amount, req.currency);

  if (!opts.approve) {
    await deleteReceipt(req.receiptPath);
    await db.pendingCardPayment.update({ where: { id: requestId }, data: { receiptPath: null } });
    await notifyRejected(req, opts.actor, opts.reason);
    await closeTelegramMessages(
      req.tgMessages,
      `❌ <b>Rad etildi</b> — ${escapeHtml(req.client.restaurantName)} · ${escapeHtml(money)}` +
        (opts.reason ? `\nSabab: ${escapeHtml(cardRejectReasonLabel(opts.reason))}` : "") +
        `\nHal qildi: ${escapeHtml(opts.actor.name)}`,
    );
    await logAudit("Karta to'lovi rad etildi", {
      entity: "Client",
      entityId: req.clientId,
      detail: `${req.client.restaurantName}: ${money}${opts.reason ? ` — ${cardRejectReasonLabel(opts.reason)}` : ""}`,
      actor: { userId: opts.actor.userId, name: opts.actor.name },
    });
    safeRevalidate("/tolovlar");
    return { ok: true };
  }

  // --- Tasdiqlandi: haqiqiy to'lovni yozamiz -------------------------------
  if (!req.receiptPath) {
    await revertClaim(requestId);
    return { ok: false, error: "Chek fayli yo'q" };
  }
  const file = await readReceipt(req.receiptPath);
  if (!file) {
    await revertClaim(requestId);
    return { ok: false, error: "Chek fayli o'qilmadi" };
  }

  // To'lov ASL operator nomiga yoziladi (kim qabul qilgan bo'lsa) — tasdiqlovchi
  // faqat pul tushganini tekshiradi, to'lovni qabul qilgan xodim emas.
  const recorder: SessionPayload = {
    userId: req.recordedBy?.id ?? opts.actor.userId,
    name: req.recordedBy?.name ?? opts.actor.name,
    username: req.recordedBy?.username ?? "",
    role: req.recordedBy?.role ?? "OPERATOR",
    version: 0,
  };

  const res = await processPayment(
    recorder,
    req.clientId,
    {
      amount: req.amount,
      currency: req.currency,
      days: req.days,
      method: req.method,
      paidAt: req.paidAt.toISOString(),
      receiptNote: req.receiptNote ?? undefined,
    },
    file,
  );
  if (!res.ok) {
    await revertClaim(requestId);
    return { ok: false, error: res.error };
  }

  await deleteReceipt(req.receiptPath);
  await db.pendingCardPayment.update({
    where: { id: requestId },
    data: { paymentId: res.paymentId, receiptPath: null },
  });

  await notifyConfirmed(req, opts.actor);
  await closeTelegramMessages(
    req.tgMessages,
    `✅ <b>Tasdiqlandi</b> — ${escapeHtml(req.client.restaurantName)} · ${escapeHtml(money)}` +
      `\nHal qildi: ${escapeHtml(opts.actor.name)}`,
  );
  await logAudit("Karta to'lovi tasdiqlandi", {
    entity: "Client",
    entityId: req.clientId,
    detail: `${req.client.restaurantName}: ${money}`,
    actor: { userId: opts.actor.userId, name: opts.actor.name },
  });

  safeRevalidate("/tolovlar");
  return { ok: true, paymentId: res.paymentId };
}

/** Band qilishni qaytaradi (to'lov yozilmasa so'rov navbatda qolsin). */
async function revertClaim(requestId: string): Promise<void> {
  await db.pendingCardPayment.update({
    where: { id: requestId },
    data: {
      status: "PENDING",
      resolvedById: null,
      resolvedAt: null,
      resolvedVia: null,
      rejectReason: null,
    },
  });
}

type ReqWithRefs = {
  id: string;
  amount: number;
  currency: string;
  recordedById: string | null;
  recordedBy: { id: string; name: string; telegramId: string | null } | null;
  client: { restaurantName: string };
};

async function adminIds(): Promise<string[]> {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** Rad etilganda: operator + adminlarga bildirishnoma (va operatorga DM). */
async function notifyRejected(req: ReqWithRefs, actor: Actor, reason?: string): Promise<void> {
  const money = formatMoney(req.amount, req.currency);
  const reasonText = reason ? ` Sabab: ${cardRejectReasonLabel(reason)}.` : "";
  const body =
    `${req.client.restaurantName} — ${money} to'lovi QABUL QILINMADI: ` +
    `${actor.name} kartaga tushmaganini bildirdi.${reasonText} ` +
    `Mijozning to'lov sanasi surilmadi — mijoz bilan bog'laning.`;

  await createNotification({
    title: "❌ Karta to'lovi rad etildi",
    body,
    priority: "IMPORTANT",
    userIds: [...(req.recordedById ? [req.recordedById] : []), ...(await adminIds())],
  });

  if (req.recordedBy?.telegramId) {
    await sendMessage(req.recordedBy.telegramId, `❌ <b>To'lov qabul qilinmadi</b>\n${escapeHtml(body)}`);
  }
}

/** Tasdiqlanganda: to'lovni kiritgan xodimga xabar (admin uchun shovqin qilmaymiz). */
async function notifyConfirmed(req: ReqWithRefs, actor: Actor): Promise<void> {
  const money = formatMoney(req.amount, req.currency);
  const body = `${req.client.restaurantName} — ${money} to'lovi ${actor.name} tomonidan tasdiqlandi va yozildi.`;
  await createNotification({
    title: "✅ Karta to'lovi tasdiqlandi",
    body,
    priority: "NORMAL",
    userIds: req.recordedById ? [req.recordedById] : [],
  });
  if (req.recordedBy?.telegramId) {
    await sendMessage(req.recordedBy.telegramId, `✅ ${escapeHtml(body)}`);
  }
}

/**
 * Javobsiz qolgan so'rovlar: `staleHours` dan oshganlari uchun tasdiqlovchiga
 * qayta xabar, adminlarga bildirishnoma. Kuniga bir marta (worker cron).
 * @returns eslatilgan so'rovlar soni
 */
export async function remindStaleCardRequests(staleHours = 3): Promise<number> {
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);
  const stale = await db.pendingCardPayment.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    include: { client: { select: { restaurantName: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (stale.length === 0) return 0;

  const verifiers = await listCardVerifiers();
  const lines = stale.map(
    (r) => `• ${r.client.restaurantName} — ${formatMoney(r.amount, r.currency)} (${formatDate(r.createdAt)})`,
  );
  const text =
    `⏳ <b>Tasdiq kutayotgan karta to'lovlari: ${stale.length}</b>\n` +
    lines.join("\n") +
    `\n\nTasdiqlanmaguncha bu to'lovlar hisobga olinmaydi.`;

  for (const v of verifiers) await sendMessage(v.telegramId, text);

  await createNotification({
    title: "⏳ Karta to'lovlari tasdiq kutmoqda",
    body: `${stale.length} ta to'lov ${staleHours} soatdan beri tasdiqlanmagan. /tolovlar sahifasida ko'ring.`,
    priority: "IMPORTANT",
    userIds: await adminIds(),
  });

  await db.pendingCardPayment.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { remindedAt: new Date() },
  });
  return stale.length;
}

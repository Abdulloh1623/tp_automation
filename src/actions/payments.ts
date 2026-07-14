"use server";

import { z } from "zod";
import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { saveReceipt, deleteReceipt } from "@/lib/receipts";
import { nextPaymentAfterDelete } from "@/lib/billing";
import { sendPaymentToChannel, escapeHtml } from "@/lib/telegram";
import { formatMoney, formatDate } from "@/lib/utils";
import { PAYMENT_METHOD, type PaymentMethod } from "@/lib/constants";
import { currencyEnum, noteString, paymentMethodEnum } from "@/lib/validation";
import type { SessionPayload } from "@/lib/session";

// Mijoz/to'lov bilan ishlovchi xodimlar (usta — INSTALLER taqiqlanadi)
const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Summani kiriting"),
  currency: currencyEnum.default("UZS"),
  paidAt: z.string().optional(),
  // To'lov muddati kunlarda (default 30 kun) — keyingi to'lov sanasi shunga qarab
  days: z.coerce.number().int().min(1).max(366).default(30),
  method: paymentMethodEnum.default("CARD"),
  receiptNote: noteString.optional(),
});

export type PaymentFormState = { error?: string; ok?: boolean };

/** FormData'dan chek faylini o'qiydi (majburiy). */
async function readReceiptFile(
  formData: FormData,
): Promise<{ buffer: Buffer; mime: string } | { error: string }> {
  const f = formData.get("receipt");
  if (!(f instanceof File) || f.size === 0) {
    return { error: "Chek rasmi majburiy" };
  }
  const buffer = Buffer.from(await f.arrayBuffer());
  return { buffer, mime: f.type };
}

/** To'lov kanali uchun caption — mijozning to'liq ma'lumoti + summa + sana. */
function paymentCaption(
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
async function processPayment(
  session: SessionPayload,
  clientId: string,
  fields: {
    amount: number;
    currency: string;
    days: number;
    method: string;
    paidAt?: string;
    receiptNote?: string;
  },
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
  await sendPaymentToChannel(caption, receipt.buffer);

  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/mijozlar");
  revalidatePath("/tolovlar");
  revalidatePath("/");
  return { ok: true, paymentId: payment.id };
}

/** Mijoz kartochkasidagi to'lov formasi (chek majburiy). */
export async function recordPayment(
  clientId: string,
  formData: FormData,
): Promise<PaymentFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  if (!(await canMutateClient(g.session, clientId))) {
    return { error: "Mijoz topilmadi" };
  }

  const parsed = paymentSchema.safeParse({
    amount: s(formData.get("amount")),
    currency: s(formData.get("currency")) ?? "UZS",
    paidAt: s(formData.get("paidAt")),
    days: s(formData.get("days")) ?? 30,
    method: s(formData.get("method")) ?? "CARD",
    receiptNote: s(formData.get("receiptNote")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Maʼlumotlar noto'g'ri" };
  }

  const rc = await readReceiptFile(formData);
  if ("error" in rc) return { error: rc.error };

  const res = await processPayment(g.session, clientId, parsed.data, rc);
  return res.ok ? { ok: true } : { error: res.error };
}

/** Lidlar jadvalidagi "To'lov qildi" — to'lov + chek + kanal + lid RESOLVED. */
export async function recordLeadPayment(
  clientId: string,
  formData: FormData,
): Promise<PaymentFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  if (!(await canMutateClient(g.session, clientId))) {
    return { error: "Mijoz topilmadi" };
  }

  const parsed = paymentSchema.safeParse({
    amount: s(formData.get("amount")),
    currency: s(formData.get("currency")) ?? "UZS",
    paidAt: s(formData.get("paidAt")),
    days: s(formData.get("days")) ?? 30,
    method: s(formData.get("method")) ?? "CARD",
    receiptNote: s(formData.get("receiptNote")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Maʼlumotlar noto'g'ri" };
  }

  const rc = await readReceiptFile(formData);
  if ("error" in rc) return { error: rc.error };

  const res = await processPayment(g.session, clientId, parsed.data, rc);
  if (!res.ok) return { error: res.error };

  // Lid natijasi: "To'lov qildi" → bo'lim RESOLVED (izoh — to'lov usuli)
  await db.callLog.create({
    data: {
      clientId,
      result: "PAID",
      note:
        parsed.data.receiptNote ??
        PAYMENT_METHOD[parsed.data.method as PaymentMethod] ??
        null,
      operatorId: g.session.userId,
    },
  });
  await db.client.update({
    where: { id: clientId },
    data: {
      pendingStage: "RESOLVED",
      lastOutcome: "PAID",
      lastContactedAt: new Date(),
      missedCallCount: 0,
    },
  });
  revalidatePath("/lidlar");
  return { ok: true };
}

// --- ADMIN: to'lov tarixini tuzatish (edit/delete) ---

// Tahrirlashда faqat tavsifiy maydonlar — muddat/period va nextPaymentDate tegilmaydi
const paymentEditSchema = z.object({
  amount: z.coerce.number().positive("Summani kiriting"),
  currency: currencyEnum.default("UZS"),
  paidAt: z.string().optional(),
  method: paymentMethodEnum.default("CARD"),
  receiptNote: noteString.optional(),
});

/** ADMIN: to'lovning tavsifiy maydonlarini tahrirlaydi (billing'ga tegmaydi). */
export async function updatePayment(
  paymentId: string,
  formData: FormData,
): Promise<PaymentFormState> {
  const g = await guardRole(["ADMIN"]);
  if (!g.ok) return { error: g.error };

  const parsed = paymentEditSchema.safeParse({
    amount: s(formData.get("amount")),
    currency: s(formData.get("currency")) ?? "UZS",
    paidAt: s(formData.get("paidAt")),
    method: s(formData.get("method")) ?? "CARD",
    receiptNote: s(formData.get("receiptNote")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Maʼlumotlar noto'g'ri" };
  }

  const existing = await db.payment.findUnique({
    where: { id: paymentId },
    select: { clientId: true, client: { select: { restaurantName: true } } },
  });
  if (!existing) return { error: "To'lov topilmadi" };

  await db.payment.update({
    where: { id: paymentId },
    data: {
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
      method: parsed.data.method,
      receiptNote: parsed.data.receiptNote ?? null,
    },
  });

  await logAudit("To'lov tahrirlandi", {
    entity: "Client",
    entityId: existing.clientId,
    detail: `${existing.client.restaurantName}: ${formatMoney(parsed.data.amount, parsed.data.currency)}`,
  });
  revalidatePath(`/mijozlar/${existing.clientId}`);
  revalidatePath("/tolovlar");
  return { ok: true };
}

/** ADMIN: to'lovni o'chiradi + chek fayli; keyingi to'lov sanasi qayta hisoblanadi. */
export async function deletePayment(paymentId: string): Promise<PaymentFormState> {
  const g = await guardRole(["ADMIN"]);
  if (!g.ok) return { error: g.error };

  const existing = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      clientId: true,
      receiptPath: true,
      amount: true,
      currency: true,
      client: { select: { restaurantName: true, contractDate: true, createdAt: true } },
    },
  });
  if (!existing) return { error: "To'lov topilmadi" };

  await db.payment.delete({ where: { id: paymentId } });

  // Keyingi to'lov sanasini qayta hisoblash — qolgan eng oxirgi periodEnd bo'yicha
  const latest = await db.payment.findFirst({
    where: { clientId: existing.clientId },
    orderBy: { periodEnd: "desc" },
    select: { periodEnd: true },
  });
  const anchor = existing.client.contractDate ?? existing.client.createdAt;
  const nextPaymentDate = nextPaymentAfterDelete(latest?.periodEnd ?? null, anchor);
  await db.client.update({
    where: { id: existing.clientId },
    data: { nextPaymentDate },
  });

  await deleteReceipt(existing.receiptPath);

  await logAudit("To'lov o'chirildi", {
    entity: "Client",
    entityId: existing.clientId,
    detail: `${existing.client.restaurantName}: ${formatMoney(existing.amount, existing.currency)}`,
  });
  revalidatePath(`/mijozlar/${existing.clientId}`);
  revalidatePath("/tolovlar");
  return { ok: true };
}

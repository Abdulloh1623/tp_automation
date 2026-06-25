"use server";

import { z } from "zod";
import { addMonths } from "date-fns";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { saveReceipt } from "@/lib/receipts";
import { sendPaymentToChannel, escapeHtml } from "@/lib/telegram";
import { formatMoney, formatDate } from "@/lib/utils";
import type { SessionPayload } from "@/lib/session";

// Mijoz/to'lov bilan ishlovchi xodimlar (usta — INSTALLER taqiqlanadi)
const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Summani kiriting"),
  currency: z.string().default("USD"),
  paidAt: z.string().optional(),
  months: z.coerce.number().int().min(1).max(24).default(1),
  receiptNote: z.string().optional(),
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
    months: number;
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
    `💵 To'lov: <b>${formatMoney(p.amount, p.currency)}</b>${p.months > 1 ? ` (${p.months} oy)` : ""}`,
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
  fields: { amount: number; currency: string; months: number; paidAt?: string; receiptNote?: string },
  receipt: { buffer: Buffer; mime: string },
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { phones: { orderBy: { createdAt: "asc" } } },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const { amount, currency, months } = fields;
  const paidAt = fields.paidAt ? new Date(fields.paidAt) : new Date();
  const now = new Date();
  const base =
    client.nextPaymentDate && client.nextPaymentDate > now ? client.nextPaymentDate : now;
  const nextPaymentDate = addMonths(base, months);

  const payment = await db.payment.create({
    data: {
      clientId,
      amount,
      currency,
      paidAt,
      periodStart: base,
      periodEnd: nextPaymentDate,
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
    months,
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
    return { error: "Bu mijoz sizga biriktirilmagan" };
  }

  const parsed = paymentSchema.safeParse({
    amount: s(formData.get("amount")),
    currency: s(formData.get("currency")) ?? "USD",
    paidAt: s(formData.get("paidAt")),
    months: s(formData.get("months")) ?? 1,
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
    return { error: "Bu mijoz sizga biriktirilmagan" };
  }

  const parsed = paymentSchema.safeParse({
    amount: s(formData.get("amount")),
    currency: s(formData.get("currency")) ?? "USD",
    paidAt: s(formData.get("paidAt")),
    months: s(formData.get("months")) ?? 1,
    receiptNote: s(formData.get("receiptNote")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Maʼlumotlar noto'g'ri" };
  }

  const rc = await readReceiptFile(formData);
  if ("error" in rc) return { error: rc.error };

  const res = await processPayment(g.session, clientId, parsed.data, rc);
  if (!res.ok) return { error: res.error };

  // Lid natijasi: "To'lov qildi" → bo'lim RESOLVED
  await db.callLog.create({
    data: {
      clientId,
      result: "PAID",
      note: parsed.data.receiptNote ?? null,
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

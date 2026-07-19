"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { readReceipt, deleteReceipt } from "@/lib/receipts";
import { processPayment } from "@/lib/payment-core";
import { currencyEnum, noteString, paymentMethodEnum } from "@/lib/validation";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

export type PendingFormState = { error?: string; ok?: boolean };

// Summa Telegram xabarida bo'lmaydi (faqat chek ichida) — operator kiritadi.
const confirmSchema = z.object({
  clientId: z.string().min(1, "Mijozni tanlang"),
  amount: z.coerce.number().positive("Summani kiriting"),
  currency: currencyEnum.default("UZS"),
  paidAt: z.string().optional(),
  days: z.coerce.number().int().min(1).max(366).default(30),
  method: paymentMethodEnum.default("CARD"),
  receiptNote: noteString.optional(),
});

/**
 * Telegramdan kelgan chekni tasdiqlaydi — haqiqiy to'lov shu yerda yaratiladi.
 * Chek fayli PendingPayment'dan o'qib olinadi, qolgani oddiy to'lov yo'li bilan
 * bir xil (billing, audit, kanal xabari).
 */
export async function confirmPendingPayment(
  pendingId: string,
  formData: FormData,
): Promise<PendingFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };

  const parsed = confirmSchema.safeParse({
    clientId: s(formData.get("clientId")),
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
  const { clientId, ...fields } = parsed.data;

  if (!(await canMutateClient(g.session, clientId))) {
    return { error: "Mijoz topilmadi" };
  }

  const pending = await db.pendingPayment.findUnique({ where: { id: pendingId } });
  if (!pending) return { error: "Chek topilmadi" };
  if (pending.status !== "PENDING") {
    return { error: "Bu chek allaqachon ko'rib chiqilgan" };
  }
  if (!pending.receiptPath) return { error: "Chek fayli yo'q" };

  const file = await readReceipt(pending.receiptPath);
  if (!file) return { error: "Chek fayli o'qilmadi" };

  // Ikki operator bir vaqtda tasdiqlashiga yo'l qo'ymaymiz: statusni
  // to'lov yaratishdan OLDIN band qilamiz.
  const claimed = await db.pendingPayment.updateMany({
    where: { id: pendingId, status: "PENDING" },
    data: { status: "CONFIRMED", resolvedById: g.session.userId, resolvedAt: new Date() },
  });
  if (claimed.count === 0) return { error: "Bu chek allaqachon ko'rib chiqilgan" };

  const res = await processPayment(g.session, clientId, fields, file);
  if (!res.ok) {
    // To'lov yozilmasa bandlikni qaytaramiz — chek navbatda qolsin
    await db.pendingPayment.update({
      where: { id: pendingId },
      data: { status: "PENDING", resolvedById: null, resolvedAt: null },
    });
    return { error: res.error };
  }

  // Chek endi Payment'ning o'z faylida (receipts/<paymentId>.*) — navbatdagi
  // nusxa keraksiz, diskni band qilmasin.
  await deleteReceipt(pending.receiptPath);
  await db.pendingPayment.update({
    where: { id: pendingId },
    data: { paymentId: res.paymentId, suggestedClientId: clientId, receiptPath: null },
  });

  await logAudit("Telegram cheki tasdiqlandi", {
    entity: "Client",
    entityId: clientId,
    detail: pending.parsedName ?? pending.rawText?.slice(0, 200) ?? "Telegram cheki",
  });

  revalidatePath("/tolovlar");
  return { ok: true };
}

/** Chekni rad etadi (dublikat, xato xabar, reklama va h.k.). */
export async function rejectPendingPayment(
  pendingId: string,
  reason?: string,
): Promise<PendingFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };

  const pending = await db.pendingPayment.findUnique({
    where: { id: pendingId },
    select: { status: true, receiptPath: true, parsedName: true },
  });
  if (!pending) return { error: "Chek topilmadi" };
  if (pending.status !== "PENDING") {
    return { error: "Bu chek allaqachon ko'rib chiqilgan" };
  }

  const updated = await db.pendingPayment.updateMany({
    where: { id: pendingId, status: "PENDING" },
    data: {
      status: "REJECTED",
      rejectReason: reason?.trim()?.slice(0, 500) || null,
      resolvedById: g.session.userId,
      resolvedAt: new Date(),
    },
  });
  if (updated.count === 0) return { error: "Bu chek allaqachon ko'rib chiqilgan" };

  // Rad etilgan chek fayli kerak emas — diskni band qilmasin
  await deleteReceipt(pending.receiptPath);
  await db.pendingPayment.update({
    where: { id: pendingId },
    data: { receiptPath: null },
  });

  await logAudit("Telegram cheki rad etildi", {
    entity: "PendingPayment",
    entityId: pendingId,
    detail: pending.parsedName ?? "Telegram cheki",
  });

  revalidatePath("/tolovlar");
  return { ok: true };
}

/** Tasdiqlash oynasi uchun mijoz qidiruvi (nom yoki telefon bo'yicha). */
export async function searchClientsForReceipt(
  query: string,
): Promise<{ id: string; label: string }[]> {
  const g = await guardRole(STAFF);
  if (!g.ok) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  const digits = q.replace(/\D/g, "");
  const rows = await db.client.findMany({
    where: {
      OR: [
        { restaurantName: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ],
    },
    select: { id: true, restaurantName: true, fullName: true, phone: true },
    take: 20,
    orderBy: { restaurantName: "asc" },
  });

  return rows.map((c) => ({
    id: c.id,
    label: `${c.restaurantName} — ${c.fullName} (${c.phone})`,
  }));
}

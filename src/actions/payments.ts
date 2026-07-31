"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { deleteReceipt } from "@/lib/receipts";
import { nextPaymentAfterDelete } from "@/lib/billing";
import { processPayment } from "@/lib/payment-core";
import { createCardConfirmationRequest, needsCardConfirmation } from "@/lib/card-payment";
import { formatDate, formatMoney } from "@/lib/utils";
import { revalidatePaymentSurfaces } from "@/lib/revalidate";
import { PAYMENT_METHOD, type PaymentMethod } from "@/lib/constants";
import { currencyEnum, noteString, paymentMethodEnum } from "@/lib/validation";

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

/** `pending` — to'lov yozilmadi, karta egasi tasdig'i kutilmoqda. */
export type PaymentFormState = { error?: string; ok?: boolean; pending?: boolean };

/**
 * Karta/QR to'lovini tasdiqlash navbatiga qo'yadi.
 *
 * `null` qaytsa — tasdiqlash kerak emas (boshqa usul) yoki tasdiqlovchi
 * sozlanmagan; bunday holda chaqiruvchi to'lovni odatdagidek yozadi.
 */
async function routeThroughCardConfirmation(
  session: { userId: string; name: string },
  clientId: string,
  fields: z.infer<typeof paymentSchema>,
  receipt: { buffer: Buffer; mime: string },
): Promise<PaymentFormState | null> {
  if (!needsCardConfirmation(fields.method)) return null;

  const res = await createCardConfirmationRequest({
    clientId,
    amount: fields.amount,
    currency: fields.currency,
    days: fields.days,
    method: fields.method,
    paidAt: fields.paidAt,
    receiptNote: fields.receiptNote,
    receipt,
    actor: { userId: session.userId, name: session.name },
  });
  if (res.ok) {
    revalidatePath(`/mijozlar/${clientId}`);
    revalidatePath("/tolovlar");
    return { ok: true, pending: true };
  }
  // Tasdiqlovchi umuman sozlanmagan bo'lsa to'lovni bloklamaymiz — aks holda
  // to'lovlar abadiy "kutilmoqda"da osilib qolardi. Qolgan xatolar qaytariladi.
  return res.noVerifier ? null : { error: res.error };
}

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

  // Karta/QR — avval kartaga dostupi bor xodim tasdiqlaydi (to'lov hali yozilmaydi)
  const routed = await routeThroughCardConfirmation(g.session, clientId, parsed.data, rc);
  if (routed) return routed;

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

  // Karta/QR — tasdiq kutiladi. Lid natijasi baribir yopiladi (qo'ng'iroq
  // bajarildi); tasdiq kelmasa mijoz qarzdor bo'lib ertangi taqsimotga qaytadi
  // va operatorga rad etilgani haqida bildirishnoma boradi.
  const routed = await routeThroughCardConfirmation(g.session, clientId, parsed.data, rc);
  if (routed && routed.error) return routed;

  if (!routed) {
    const res = await processPayment(g.session, clientId, parsed.data, rc);
    if (!res.ok) return { error: res.error };
  }

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
  return { ok: true, pending: routed?.pending };
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
    select: {
      clientId: true,
      amount: true,
      currency: true,
      method: true,
      paidAt: true,
      client: { select: { restaurantName: true } },
    },
  });
  if (!existing) return { error: "To'lov topilmadi" };

  const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined;

  await db.payment.update({
    where: { id: paymentId },
    data: {
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      paidAt,
      method: parsed.data.method,
      receiptNote: parsed.data.receiptNote ?? null,
    },
  });

  // Audit hisobotida "nima o'zgardi" ko'rinib tursin — faqat yangi qiymat emas.
  const changes: string[] = [];
  if (
    existing.amount !== parsed.data.amount ||
    existing.currency !== parsed.data.currency
  ) {
    changes.push(
      `summa ${formatMoney(existing.amount, existing.currency)} → ${formatMoney(parsed.data.amount, parsed.data.currency)}`,
    );
  }
  if (paidAt && paidAt.getTime() !== existing.paidAt.getTime()) {
    changes.push(`sana ${formatDate(existing.paidAt)} → ${formatDate(paidAt)}`);
  }
  if (existing.method !== parsed.data.method) {
    const label = (m: string | null) =>
      m ? (PAYMENT_METHOD[m as PaymentMethod] ?? m) : "—";
    changes.push(`usul ${label(existing.method)} → ${label(parsed.data.method)}`);
  }

  await logAudit("To'lov tahrirlandi", {
    entity: "Client",
    entityId: existing.clientId,
    detail: `${existing.client.restaurantName}: ${
      changes.length
        ? changes.join(", ")
        : formatMoney(parsed.data.amount, parsed.data.currency)
    }`,
  });
  // Summa/sana o'zgarishi kunlik-oylik hisobotlarga ham tegadi — barcha
  // hisob-kitob sahifalari keshi birga yangilanadi.
  revalidatePaymentSurfaces(existing.clientId);
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
  revalidatePaymentSurfaces(existing.clientId);
  return { ok: true };
}

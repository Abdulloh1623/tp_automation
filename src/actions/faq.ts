"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { saveFaqImage } from "@/lib/faq-docs";

// Yaratish — istalgan xodim; tahrir/o'chirish — faqat ADMIN.
const AUTHORS = ["ADMIN", "OPERATOR", "MANAGER"];
const ADMINS = ["ADMIN"];

export type FaqState = { ok: boolean; error?: string };

const schema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Savol kamida 3 belgidan iborat bo'lsin")
    .max(300, "Savol juda uzun (300 belgigacha)"),
  details: z
    .string()
    .trim()
    .max(10000, "Muammo tafsiloti juda uzun")
    .optional()
    .transform((v) => (v ? v : null)),
  solution: z
    .string()
    .trim()
    .min(3, "Yechim kamida 3 belgidan iborat bo'lsin")
    .max(20000, "Yechim juda uzun"),
});

function parse(formData: FormData) {
  return schema.safeParse({
    question: formData.get("question"),
    details: formData.get("details") || undefined,
    solution: formData.get("solution"),
  });
}

export async function createFaq(formData: FormData): Promise<FaqState> {
  const g = await guardRole(AUTHORS);
  if (!g.ok) return { ok: false, error: g.error };
  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const row = await db.faqEntry.create({
    data: { ...parsed.data, createdById: g.session.userId },
  });
  await logAudit("FAQ qo'shildi", { entity: "FaqEntry", entityId: row.id, detail: parsed.data.question });
  revalidatePath("/faq");
  return { ok: true };
}

export async function updateFaq(id: string, formData: FormData): Promise<FaqState> {
  const g = await guardRole(ADMINS);
  if (!g.ok) return { ok: false, error: g.error };
  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const exists = await db.faqEntry.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { ok: false, error: "FAQ topilmadi" };
  await db.faqEntry.update({ where: { id }, data: parsed.data });
  await logAudit("FAQ tahrirlandi", { entity: "FaqEntry", entityId: id, detail: parsed.data.question });
  revalidatePath("/faq");
  return { ok: true };
}

export async function deleteFaq(id: string): Promise<FaqState> {
  const g = await guardRole(ADMINS);
  if (!g.ok) return { ok: false, error: g.error };
  const exists = await db.faqEntry.findUnique({ where: { id }, select: { question: true } });
  if (!exists) return { ok: false, error: "FAQ topilmadi" };
  await db.faqEntry.delete({ where: { id } });
  await logAudit("FAQ o'chirildi", { entity: "FaqEntry", entityId: id, detail: exists.question });
  revalidatePath("/faq");
  return { ok: true };
}

export type UploadState =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Skrinshotni uploads/faq/ ga saqlaydi va markdown uchun URL qaytaradi. */
export async function uploadFaqImage(formData: FormData): Promise<UploadState> {
  const g = await guardRole(AUTHORS);
  if (!g.ok) return { ok: false, error: g.error };
  const f = formData.get("image");
  if (!(f instanceof File) || f.size === 0) {
    return { ok: false, error: "Rasm tanlanmagan" };
  }
  const buffer = Buffer.from(await f.arrayBuffer());
  const res = await saveFaqImage(buffer, f.type, randomUUID());
  if (!res.ok) return { ok: false, error: res.error };
  // relPath = "faq/<uuid>.<ext>" → himoyalangan route
  const fileName = res.relPath.replace(/^faq\//, "");
  return { ok: true, url: `/api/faq-image/${fileName}` };
}

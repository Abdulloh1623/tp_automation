"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";

export type ResetActionState = { ok: boolean; error?: string };

/**
 * So'rovni ko'rib chiqish uchun ruxsat: ADMIN/SUPER_ADMIN — istalgan so'rov;
 * HEAD_OF_SUPPORT — faqat OPERATOR hisobining so'rovi (TP xodimlarini CRUD
 * qilish vakolati doirasida).
 */
async function requireReviewer(targetUserId: string) {
  const session = await requireSession();
  if (session.role === "ADMIN" || session.role === "SUPER_ADMIN") {
    return { ok: true as const, session };
  }
  if (session.role === "HEAD_OF_SUPPORT") {
    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });
    if (target?.role === "OPERATOR") return { ok: true as const, session };
  }
  return { ok: false as const, error: "Ruxsat yo'q" };
}

/** Foydalanuvchi o'z profili orqali parolni tiklash so'rovini yuboradi (PENDING). */
export async function requestPasswordReset(input: {
  newPassword: string;
  confirm: string;
  note?: string;
}): Promise<ResetActionState> {
  const session = await requireSession();
  if (session.role === "INSTALLER") return { ok: false, error: "Ruxsat yo'q" };

  const pw = (input.newPassword ?? "").trim();
  const cf = (input.confirm ?? "").trim();
  if (pw.length < MIN_PASSWORD_LENGTH || pw.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Parol ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} belgi bo'lsin` };
  }
  if (pw !== cf) return { ok: false, error: "Parollar bir-biriga mos kelmadi" };

  const newPasswordHash = await bcrypt.hash(pw, 10);
  // Bittadan ortiq kutilayotgan so'rov bo'lmasin — eskisini almashtiramiz.
  await db.passwordResetRequest.deleteMany({
    where: { userId: session.userId, status: "PENDING" },
  });
  await db.passwordResetRequest.create({
    data: {
      userId: session.userId,
      newPasswordHash,
      note: (input.note ?? "").trim() || null,
    },
  });
  await logAudit("Parol tiklash so'rovi yuborildi", {
    entity: "User",
    entityId: session.userId,
    detail: session.name,
  });
  revalidatePath("/profil");
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

/** Foydalanuvchi o'z kutilayotgan so'rovini bekor qiladi. */
export async function cancelMyPasswordReset(): Promise<ResetActionState> {
  const session = await requireSession();
  await db.passwordResetRequest.deleteMany({
    where: { userId: session.userId, status: "PENDING" },
  });
  revalidatePath("/profil");
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

/** Admin/TP rahbari so'rovni tasdiqlaydi — yangi parol kuchga kiradi. */
export async function approvePasswordReset(id: string): Promise<ResetActionState> {
  const req = await db.passwordResetRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan" };
  const admin = await requireReviewer(req.userId);
  if (!admin.ok) return admin;

  await db.$transaction([
    // sessionVersion — parol almashgach eski cookie'lar bekor bo'lsin
    // (o'g'irlangan sessiya parol tiklangandan keyin ham ishlab turmasin).
    db.user.update({
      where: { id: req.userId },
      data: {
        passwordHash: req.newPasswordHash,
        sessionVersion: { increment: 1 },
      },
    }),
    db.passwordResetRequest.update({
      where: { id },
      data: { status: "APPROVED", resolvedAt: new Date(), resolvedById: admin.session.userId },
    }),
  ]);
  await logAudit("Parol tiklash tasdiqlandi", { entity: "User", entityId: req.userId });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

/** Admin/TP rahbari so'rovni rad etadi — parol o'zgarmaydi. */
export async function rejectPasswordReset(id: string): Promise<ResetActionState> {
  const req = await db.passwordResetRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan" };
  const admin = await requireReviewer(req.userId);
  if (!admin.ok) return admin;

  await db.passwordResetRequest.update({
    where: { id },
    data: { status: "REJECTED", resolvedAt: new Date(), resolvedById: admin.session.userId },
  });
  await logAudit("Parol tiklash rad etildi", { entity: "User", entityId: req.userId });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

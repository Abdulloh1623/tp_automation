"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type ResetActionState = { ok: boolean; error?: string };

async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false as const, error: "Ruxsat yo'q" };
  return { ok: true as const, session };
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
  if (pw.length < 4) return { ok: false, error: "Parol kamida 4 belgi bo'lsin" };
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

/** Admin so'rovni tasdiqlaydi — yangi parol kuchga kiradi. */
export async function approvePasswordReset(id: string): Promise<ResetActionState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const req = await db.passwordResetRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan" };

  await db.$transaction([
    db.user.update({ where: { id: req.userId }, data: { passwordHash: req.newPasswordHash } }),
    db.passwordResetRequest.update({
      where: { id },
      data: { status: "APPROVED", resolvedAt: new Date(), resolvedById: admin.session.userId },
    }),
  ]);
  await logAudit("Parol tiklash tasdiqlandi", { entity: "User", entityId: req.userId });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

/** Admin so'rovni rad etadi — parol o'zgarmaydi. */
export async function rejectPasswordReset(id: string): Promise<ResetActionState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const req = await db.passwordResetRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "So'rov topilmadi yoki allaqachon ko'rib chiqilgan" };

  await db.passwordResetRequest.update({
    where: { id },
    data: { status: "REJECTED", resolvedAt: new Date(), resolvedById: admin.session.userId },
  });
  await logAudit("Parol tiklash rad etildi", { entity: "User", entityId: req.userId });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

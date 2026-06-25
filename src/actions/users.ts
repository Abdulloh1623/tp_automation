"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type UserActionState = { ok: boolean; error?: string };

const ROLES = ["ADMIN", "MANAGER", "OPERATOR", "INSTALLER"];

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Ruxsat yo'q" };
  return { ok: true };
}

const baseSchema = z.object({
  name: z.string().min(1, "Ism kiriting"),
  role: z.string(),
  phone: z.string().optional(),
  telegramId: z.string().optional(),
  dailyLeadTarget: z.coerce.number().int().min(0).default(20),
});

function clean(v?: string): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Viloyatlar massivini CSV + birlamchi (region) ko'rinishga keltiradi. */
function regionData(regions?: string[]): { region: string | null; regions: string | null } {
  const regs = (regions ?? []).map((r) => r.trim()).filter(Boolean);
  return { region: regs[0] ?? null, regions: regs.length ? regs.join(",") : null };
}

export async function createUser(input: {
  name: string;
  username: string;
  password: string;
  role: string;
  regions?: string[];
  phone?: string;
  dailyLeadTarget?: number | string;
}): Promise<UserActionState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const schema = baseSchema.extend({
    username: z.string().min(3, "Login kamida 3 belgi"),
    password: z.string().min(4, "Parol kamida 4 belgi"),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Xato" };
  }
  if (!ROLES.includes(parsed.data.role)) {
    return { ok: false, error: "Rol noto'g'ri" };
  }

  const username = parsed.data.username.trim().toLowerCase();
  const exists = await db.user.findUnique({ where: { username } });
  if (exists) return { ok: false, error: "Bu login band" };

  await db.user.create({
    data: {
      name: parsed.data.name.trim(),
      username,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role,
      ...regionData(input.regions),
      phone: clean(parsed.data.phone),
      dailyLeadTarget: parsed.data.dailyLeadTarget,
    },
  });

  await logAudit("Xodim qo'shildi", {
    entity: "User",
    detail: `${parsed.data.name.trim()} — ${parsed.data.role}`,
  });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

export async function updateUser(
  id: string,
  input: {
    name: string;
    role: string;
    regions?: string[];
    phone?: string;
    telegramId?: string;
    dailyLeadTarget?: number | string;
  },
): Promise<UserActionState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Xato" };
  }
  if (!ROLES.includes(parsed.data.role)) {
    return { ok: false, error: "Rol noto'g'ri" };
  }

  try {
    await db.user.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        role: parsed.data.role,
        ...regionData(input.regions),
        phone: clean(parsed.data.phone),
        telegramId: clean(parsed.data.telegramId),
        dailyLeadTarget: parsed.data.dailyLeadTarget,
      },
    });
  } catch {
    return { ok: false, error: "Saqlashda xato (Telegram ID band bo'lishi mumkin)" };
  }

  await logAudit("Xodim tahrirlandi", {
    entity: "User",
    entityId: id,
    detail: parsed.data.name.trim(),
  });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

export async function resetPassword(
  id: string,
  password: string,
): Promise<UserActionState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!password || password.length < 4) {
    return { ok: false, error: "Parol kamida 4 belgi" };
  }
  await db.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  await logAudit("Parol tiklandi", { entity: "User", entityId: id });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

export async function setUserActive(
  id: string,
  active: boolean,
): Promise<UserActionState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  await db.user.update({ where: { id }, data: { isActive: active } });
  await logAudit(active ? "Xodim yoqildi" : "Xodim faolsizlantirildi", {
    entity: "User",
    entityId: id,
  });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isUserShift, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";

export type UserActionState = { ok: boolean; error?: string };

const ROLES = ["ADMIN", "MANAGER", "OPERATOR", "INSTALLER", "VIEWER"];

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
  // Bo'sh qoldirilsa — AVTOMATIK (null): dastur kunlik sonni o'zi hisoblaydi.
  dailyLimit: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(500)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  shift: z.string().optional(),
  // Kartaga dostupi bor xodim — karta/QR to'lovlarini u tasdiqlaydi
  cardVerifier: z.coerce.boolean().default(false),
});

/** Faqat DAY/NIGHT qabul qilinadi; boshqasi (yoki bo'sh) — DAY. */
function normShift(v?: string): "DAY" | "NIGHT" {
  return v && isUserShift(v) ? v : "DAY";
}

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
  telegramId?: string;
  dailyLimit?: number | string;
  shift?: string;
  cardVerifier?: boolean;
}): Promise<UserActionState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const schema = baseSchema.extend({
    username: z.string().min(3, "Login kamida 3 belgi"),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Parol kamida ${MIN_PASSWORD_LENGTH} belgi`)
      .max(MAX_PASSWORD_LENGTH, "Parol juda uzun"),
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

  try {
    await db.user.create({
      data: {
        name: parsed.data.name.trim(),
        username,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        role: parsed.data.role,
        ...regionData(input.regions),
        phone: clean(parsed.data.phone),
        telegramId: clean(parsed.data.telegramId),
        dailyLimit: parsed.data.dailyLimit,
        shift: normShift(parsed.data.shift),
        // Ilgari bu ikkisi sxemada parse qilinardi, lekin `create` ga
        // UZATILMASDI: yangi xodim doim `cardVerifier: false` bo'lib yaralar,
        // uni tasdiqlovchi qilish uchun yana tahrirlash kerak edi. Belgilash
        // unutilsa karta to'lovlari jimgina tasdiqsiz yozilaveradi (fail-open).
        cardVerifier: parsed.data.cardVerifier,
      },
    });
  } catch {
    return { ok: false, error: "Xodim qo'shishda xato (login band bo'lishi mumkin)" };
  }

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
    dailyLimit?: number | string;
    shift?: string;
    cardVerifier?: boolean;
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

  // Rol o'zgarsa — ochiq sessiyalarni bekor qilamiz. Aks holda tushirilgan
  // xodimning cookie'sidagi eski rol token amal qilgunicha (7 kun) kuchda
  // qolardi va u admin amallarini bajaraverardi.
  const before = await db.user.findUnique({ where: { id }, select: { role: true } });
  const roleChanged = !!before && before.role !== parsed.data.role;

  try {
    await db.user.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        role: parsed.data.role,
        ...regionData(input.regions),
        phone: clean(parsed.data.phone),
        telegramId: clean(parsed.data.telegramId),
        dailyLimit: parsed.data.dailyLimit,
        shift: normShift(parsed.data.shift),
        cardVerifier: parsed.data.cardVerifier,
        ...(roleChanged ? { sessionVersion: { increment: 1 } } : {}),
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
  if (!password || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Parol ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} belgi bo'lsin` };
  }
  // Parol almashsa — barcha ochiq sessiyalar bekor bo'lishi SHART. Aks holda
  // o'g'irlangan cookie parol yangilangandan keyin ham 7 kun ishlayveradi,
  // ya'ni parolni almashtirish hech narsani tiklamaydi.
  await db.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      sessionVersion: { increment: 1 },
    },
  });
  await logAudit("Parol tiklandi", { entity: "User", entityId: id });
  revalidatePath("/foydalanuvchilar");
  return { ok: true };
}

/**
 * Operatorning kunlik biriktirish kvotasini (dailyLimit) yangilash — boshliq/admin.
 * Tablo/monitoring ekranidan inline tahrirlanadi.
 */
export async function updateUserDailyLimit(
  userId: string,
  limit: number,
): Promise<UserActionState> {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "MANAGER") {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  const parsed = z.coerce.number().int().min(0).max(500).safeParse(limit);
  if (!parsed.success) return { ok: false, error: "Limit 0–500 oralig'ida bo'lishi kerak" };

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return { ok: false, error: "Xodim topilmadi" };

  await db.user.update({ where: { id: userId }, data: { dailyLimit: parsed.data } });
  await logAudit("Kunlik limit o'zgartirildi", {
    entity: "User",
    entityId: userId,
    detail: `${user.name}: ${parsed.data}`,
  });
  revalidatePath("/tablo");
  revalidatePath("/analitika");
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

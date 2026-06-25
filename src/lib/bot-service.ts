// Bot uchun framework-agnostik amallar (faqat Prisma + bcrypt).
// Server action'lardan farqli — cookies/next ishlatmaydi, aktyor aniq beriladi.

import bcrypt from "bcryptjs";
import { db } from "./db";
import { startOfTzDay } from "./reports";

export type Actor = { id: string; name: string; role: string };
export type Result = { ok: boolean; error?: string; info?: string };

/** Telegram ID bo'yicha botdan foydalanishga ruxsati borlarni topadi (ADMIN/MANAGER). */
export async function resolveActor(telegramId: string | number): Promise<Actor | null> {
  const u = await db.user.findFirst({
    where: {
      telegramId: String(telegramId),
      isActive: true,
      role: { in: ["ADMIN", "MANAGER"] },
    },
    select: { id: true, name: true, role: true },
  });
  return u;
}

async function audit(actor: Actor, action: string, detail?: string) {
  try {
    await db.auditLog.create({
      data: {
        userId: actor.id,
        userName: `${actor.name} (Telegram)`,
        action,
        entity: "User",
        detail: detail ?? null,
      },
    });
  } catch {
    /* audit asosiy amalni buzmaydi */
  }
}

/** Botda tanlash uchun xodimlar ro'yxati (faqat login qiladiganlar — ustalar emas). */
export async function listEmployees(): Promise<{ id: string; name: string; role: string }[]> {
  return db.user.findMany({
    where: { role: { in: ["OPERATOR", "MANAGER"] }, isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

/** Bot orqali faqat OPERATOR qo'shiladi (ustalar login'siz — /ustalar sahifasida). */
export async function addEmployee(
  actor: Actor,
  input: { name: string; username: string; password: string },
): Promise<Result> {
  const name = input.name?.trim();
  const username = input.username?.trim().toLowerCase();
  const password = input.password?.trim();
  if (!name) return { ok: false, error: "Ism bo'sh" };
  if (!username || username.length < 3) return { ok: false, error: "Login kamida 3 belgi" };
  if (!password || password.length < 4) return { ok: false, error: "Parol kamida 4 belgi" };
  if (await db.user.findUnique({ where: { username } })) {
    return { ok: false, error: "Bu login band" };
  }
  await db.user.create({
    data: {
      name,
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: "OPERATOR",
    },
  });
  await audit(actor, "Operator qo'shildi (bot)", `${name} / ${username}`);
  return { ok: true, info: `${name} (${username}) operator qo'shildi` };
}

export async function changePassword(
  actor: Actor,
  userId: string,
  newPassword: string,
): Promise<Result> {
  const pw = newPassword?.trim();
  if (!pw || pw.length < 4) return { ok: false, error: "Parol kamida 4 belgi" };
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return { ok: false, error: "Xodim topilmadi" };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(pw, 10) } });
  await audit(actor, "Parol o'zgartirildi (bot)", u.name);
  return { ok: true, info: `${u.name} paroli yangilandi` };
}

export async function setDailyTarget(
  actor: Actor,
  userId: string,
  target: number,
): Promise<Result> {
  if (!Number.isFinite(target) || target < 0 || target > 1000) {
    return { ok: false, error: "Son 0–1000 oralig'ida bo'lsin" };
  }
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return { ok: false, error: "Xodim topilmadi" };
  await db.user.update({ where: { id: userId }, data: { dailyLeadTarget: Math.round(target) } });
  await audit(actor, "Kunlik lid soni o'zgartirildi (bot)", `${u.name}: ${Math.round(target)}`);
  return { ok: true, info: `${u.name} uchun kunlik lid: ${Math.round(target)}` };
}

export async function grantExtraLeads(
  actor: Actor,
  userId: string,
  extra: number,
): Promise<Result> {
  if (!Number.isFinite(extra) || extra <= 0 || extra > 1000) {
    return { ok: false, error: "Son 1–1000 oralig'ida bo'lsin" };
  }
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return { ok: false, error: "Xodim topilmadi" };
  const date = startOfTzDay(0);
  const n = Math.round(extra);
  await db.dailyLeadGrant.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, extraCount: n, createdById: actor.id },
    update: { extraCount: n, createdById: actor.id },
  });
  await audit(actor, "1 kunlik qo'shimcha lid (bot)", `${u.name}: +${n}`);
  return { ok: true, info: `${u.name} uchun bugun +${n} lid` };
}

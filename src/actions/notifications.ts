"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendMessage, escapeHtml } from "@/lib/telegram";
import { userRoleLabel } from "@/lib/constants";

export type NotifyState = { ok: boolean; error?: string; sent?: number };

const AUDIENCES = ["ALL", "OPERATOR", "MANAGER"] as const;
type Audience = (typeof AUDIENCES)[number];

async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false as const, error: "Ruxsat yo'q" };
  return { ok: true as const, session };
}

/** Tanlangan auditoriya bo'yicha faol qabul qiluvchilar (ustalar kirmaydi). */
function audienceWhere(audience: Audience) {
  if (audience === "OPERATOR") return { isActive: true, role: "OPERATOR" };
  if (audience === "MANAGER") return { isActive: true, role: "MANAGER" };
  return { isActive: true, role: { in: ["OPERATOR", "MANAGER"] } }; // ALL — xodimlar
}

/** Admin bildirishnoma yozadi va xodimlarga yuboradi (ixtiyoriy: Telegram). */
export async function sendNotification(input: {
  title: string;
  body: string;
  priority?: string;
  audience?: string;
  telegram?: boolean;
}): Promise<NotifyState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title) return { ok: false, error: "Sarlavha kiriting" };
  if (!body) return { ok: false, error: "Matn kiriting" };
  if (title.length > 200) return { ok: false, error: "Sarlavha juda uzun" };
  if (body.length > 4000) return { ok: false, error: "Matn juda uzun" };

  const audience: Audience = AUDIENCES.includes(input.audience as Audience)
    ? (input.audience as Audience)
    : "ALL";
  const priority = input.priority === "IMPORTANT" ? "IMPORTANT" : "NORMAL";

  const recipients = await db.user.findMany({
    where: audienceWhere(audience),
    select: { id: true, telegramId: true },
  });
  if (recipients.length === 0) {
    return { ok: false, error: "Bu auditoriyada faol xodim yo'q" };
  }

  const notification = await db.notification.create({
    data: {
      title,
      body,
      priority,
      audience,
      createdById: admin.session.userId,
      recipients: { create: recipients.map((r) => ({ userId: r.id })) },
    },
  });

  // Ixtiyoriy: Telegram'i bor xodimlarga ham yuboriladi (best-effort).
  if (input.telegram) {
    const tag = priority === "IMPORTANT" ? "❗️ " : "🔔 ";
    const text = `${tag}<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`;
    await Promise.all(
      recipients
        .filter((r) => r.telegramId)
        .map((r) => sendMessage(r.telegramId as string, text).catch(() => null)),
    );
  }

  await logAudit("Bildirishnoma yuborildi", {
    entity: "Notification",
    entityId: notification.id,
    detail: `${title} — ${recipients.length} ta xodim`,
  });
  revalidatePath("/bildirishnomalar");
  return { ok: true, sent: recipients.length };
}

/**
 * Xodim/menejer tizimda muammo yuzaga kelsa ADMIN(lar)ga xabar yuboradi.
 * Bildirishnoma sifatida saqlanadi (audience "ADMIN", muhim) — admin uni feed'ida
 * yuboruvchi ismi bilan ko'radi, o'qilmagan belgisi (bell) chiqadi. Telegram'i
 * bor adminlarga darhol xabar ketadi (best-effort).
 */
export async function reportToAdmin(input: {
  title: string;
  body: string;
}): Promise<NotifyState> {
  const session = await requireSession();
  if (session.role !== "OPERATOR" && session.role !== "MANAGER") {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title) return { ok: false, error: "Mavzu kiriting" };
  if (!body) return { ok: false, error: "Muammo tafsilotini yozing" };
  if (title.length > 200) return { ok: false, error: "Mavzu juda uzun" };
  if (body.length > 4000) return { ok: false, error: "Matn juda uzun" };

  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, telegramId: true },
  });
  if (admins.length === 0) {
    return { ok: false, error: "Faol admin topilmadi" };
  }

  const notification = await db.notification.create({
    data: {
      title,
      body,
      priority: "IMPORTANT",
      audience: "ADMIN",
      createdById: session.userId,
      recipients: { create: admins.map((a) => ({ userId: a.id })) },
    },
  });

  // Telegram'i ulangan adminlarga darhol yuboriladi (best-effort).
  const text =
    `🆘 <b>Muammo xabari</b>\n` +
    `${escapeHtml(session.name)} (${escapeHtml(userRoleLabel(session.role))}):\n\n` +
    `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`;
  await Promise.all(
    admins
      .filter((a) => a.telegramId)
      .map((a) => sendMessage(a.telegramId as string, text).catch(() => null)),
  );

  await logAudit("Adminga muammo xabari yuborildi", {
    entity: "Notification",
    entityId: notification.id,
    detail: `${title} — ${session.name}`,
  });
  revalidatePath("/bildirishnomalar");
  return { ok: true, sent: admins.length };
}

/** Joriy foydalanuvchi bitta bildirishnomani o'qilgan deb belgilaydi. */
export async function markNotificationRead(notificationId: string): Promise<NotifyState> {
  const session = await requireSession();
  await db.notificationRecipient.updateMany({
    where: { notificationId, userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/bildirishnomalar");
  return { ok: true };
}

/** Joriy foydalanuvchining barcha bildirishnomalarini o'qilgan deb belgilaydi. */
export async function markAllNotificationsRead(): Promise<NotifyState> {
  const session = await requireSession();
  await db.notificationRecipient.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/bildirishnomalar");
  return { ok: true };
}

/**
 * Bildirishnomani o'chiradi (barcha qabul qiluvchilardan ham). ADMIN istalganini,
 * xodim/menejer esa faqat o'zi yuborgan (adminga muammo) xabarini o'chira oladi.
 */
export async function deleteNotification(id: string): Promise<NotifyState> {
  const session = await requireSession();
  const n = await db.notification.findUnique({
    where: { id },
    select: { createdById: true },
  });
  if (!n) return { ok: false, error: "Topilmadi" };
  if (session.role !== "ADMIN" && n.createdById !== session.userId) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  await db.notification.delete({ where: { id } });
  await logAudit("Bildirishnoma o'chirildi", { entity: "Notification", entityId: id });
  revalidatePath("/bildirishnomalar");
  return { ok: true };
}

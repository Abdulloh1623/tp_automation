"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendMessage, escapeHtml } from "@/lib/telegram";

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

/** Admin bildirishnomani o'chiradi (barcha qabul qiluvchilardan ham). */
export async function deleteNotification(id: string): Promise<NotifyState> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  await db.notification.delete({ where: { id } });
  await logAudit("Bildirishnoma o'chirildi", { entity: "Notification", entityId: id });
  revalidatePath("/bildirishnomalar");
  return { ok: true };
}

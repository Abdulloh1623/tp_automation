// Ilova ichidagi bildirishnoma yaratish uchun past-daraja yordamchi.
// `sendNotification` action (audience bo'yicha, admin-only) o'rniga aynan
// belgilangan foydalanuvchilarga (masalan SLA ogohlantirishi) yuborish uchun.
import { db } from "./db";

/**
 * Berilgan foydalanuvchilar uchun bitta bildirishnoma yaratadi (har biriga
 * o'qilmagan recipient qatori). Bo'sh ro'yxatda hech narsa qilmaydi.
 * @returns yaratilgan Notification id yoki null.
 */
export async function createNotification(opts: {
  title: string;
  body: string;
  priority?: string;
  userIds: string[];
}): Promise<string | null> {
  const ids = [...new Set(opts.userIds)].filter(Boolean);
  if (ids.length === 0) return null;
  const n = await db.notification.create({
    data: {
      title: opts.title,
      body: opts.body,
      priority: opts.priority ?? "IMPORTANT",
      audience: "ALL",
      recipients: { create: ids.map((userId) => ({ userId })) },
    },
    select: { id: true },
  });
  return n.id;
}

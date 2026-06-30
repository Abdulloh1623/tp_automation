import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotificationsFeed, type FeedItem } from "@/components/notifications-feed";
import { NotificationComposer } from "@/components/notification-composer";
import { NotificationSentList, type SentItem } from "@/components/notification-sent-list";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const AUDIENCE_LABEL: Record<string, string> = {
  ALL: "Barcha xodimlar",
  OPERATOR: "Operatorlar",
  MANAGER: "Menejerlar",
};

export default async function NotificationsPage() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  // Qabul qilingan bildirishnomalar (har bir foydalanuvchi uchun)
  const recs = await db.notificationRecipient.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      readAt: true,
      notification: {
        select: { id: true, title: true, body: true, priority: true, createdAt: true, createdById: true },
      },
    },
  });

  const creatorIds = [
    ...new Set(recs.map((r) => r.notification.createdById).filter(Boolean) as string[]),
  ];
  const creators = creatorIds.length
    ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(creators.map((c) => [c.id, c.name]));

  const items: FeedItem[] = recs.map((r) => ({
    id: r.notification.id,
    title: r.notification.title,
    body: r.notification.body,
    priority: r.notification.priority,
    createdAt: formatDateTime(r.notification.createdAt),
    fromName: r.notification.createdById
      ? nameById.get(r.notification.createdById) ?? "Admin"
      : "Admin",
    read: !!r.readAt,
  }));

  // Admin uchun yuborilganlar + o'qilish statistikasi
  let sent: SentItem[] = [];
  if (isAdmin) {
    const sentNotifs = await db.notification.findMany({
      where: { createdById: session.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        body: true,
        priority: true,
        audience: true,
        createdAt: true,
        _count: { select: { recipients: true } },
      },
    });
    const ids = sentNotifs.map((n) => n.id);
    const readGroups = ids.length
      ? await db.notificationRecipient.groupBy({
          by: ["notificationId"],
          where: { notificationId: { in: ids }, readAt: { not: null } },
          _count: true,
        })
      : [];
    const readById = new Map(readGroups.map((g) => [g.notificationId, g._count]));
    sent = sentNotifs.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      audienceLabel: AUDIENCE_LABEL[n.audience] ?? n.audience,
      priority: n.priority,
      createdAt: formatDateTime(n.createdAt),
      total: n._count.recipients,
      read: readById.get(n.id) ?? 0,
    }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Bildirishnomalar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isAdmin
            ? "Xodimlarga bildirishnoma yuboring"
            : "Sizga yuborilgan bildirishnomalar"}
        </p>
      </div>

      {isAdmin && <NotificationComposer />}
      {isAdmin && <NotificationSentList items={sent} />}

      {(!isAdmin || items.length > 0) && (
        <div className="space-y-3">
          {isAdmin && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Sizga kelganlar
            </h2>
          )}
          <NotificationsFeed items={items} />
        </div>
      )}
    </div>
  );
}

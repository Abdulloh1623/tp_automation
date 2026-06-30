import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const unreadCount = await db.notificationRecipient.count({
    where: { userId: session.userId, readAt: null },
  });
  return (
    <AppShell
      user={{ name: session.name, role: session.role }}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}

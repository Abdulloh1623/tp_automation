import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { getNavBadges } from "@/lib/nav-badges";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const badges = await getNavBadges(session.userId, session.role);
  return (
    <AppShell user={{ name: session.name, role: session.role }} badges={badges}>
      {children}
    </AppShell>
  );
}

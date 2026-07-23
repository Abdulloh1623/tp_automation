import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { getNavBadges } from "@/lib/nav-badges";
import { getMaintenance } from "@/lib/maintenance";
import { MaintenanceScreen } from "@/components/maintenance-screen";

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // `@modal` parallel slot — intercepting route (mijoz profili) overlay sifatida.
  modal: React.ReactNode;
}) {
  const session = await requireSession();

  // Texnik tanaffus (bazani tiklash) — ADMIN'dan boshqa hamma to'xtatiladi.
  // Tekshiruv shu yerda, middleware'da EMAS: middleware Edge runtime'da
  // ishlaydi va Prisma'ga kira olmaydi.
  const maintenance = await getMaintenance();
  if (maintenance.active && session.role !== "ADMIN") {
    return (
      <MaintenanceScreen reason={maintenance.reason} startedAt={maintenance.startedAt} />
    );
  }

  const badges = await getNavBadges(session.userId, session.role);
  return (
    <AppShell user={{ name: session.name, role: session.role }} badges={badges}>
      {children}
      {modal}
    </AppShell>
  );
}

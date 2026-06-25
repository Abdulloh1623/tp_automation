import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <AppShell user={{ name: session.name, role: session.role }}>
      {children}
    </AppShell>
  );
}

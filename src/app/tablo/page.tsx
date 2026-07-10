import { requireSession } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { TvBoard } from "@/components/tv-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Jonli tablo — TP Texnik xizmat",
};

export default async function TabloPage() {
  const session = await requireSession();
  const initial = await getAnalytics();
  const canManage = session.role === "ADMIN" || session.role === "MANAGER";
  return <TvBoard initial={initial} canManage={canManage} />;
}

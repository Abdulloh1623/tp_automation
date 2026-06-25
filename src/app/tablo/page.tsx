import { requireSession } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { TvBoard } from "@/components/tv-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Jonli tablo — TP Texnik xizmat",
};

export default async function TabloPage() {
  await requireSession();
  const initial = await getAnalytics();
  return <TvBoard initial={initial} />;
}

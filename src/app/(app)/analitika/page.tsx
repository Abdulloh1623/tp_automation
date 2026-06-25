import { requireRole } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { AnalyticsLive } from "@/components/analytics-live";

export const dynamic = "force-dynamic";

export default async function AnalitikaPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const initial = await getAnalytics();
  return <AnalyticsLive initial={initial} />;
}

import { requireApiSession } from "@/lib/auth";
import { getOperatorDailyStats } from "@/lib/analytics";
import { withDbRetry } from "@/lib/db-retry";

export const dynamic = "force-dynamic";

// Feature B — joriy operatorning bugungi ko'rsatkichlari (jonli progress bar).
// Har bir foydalanuvchi faqat o'z ma'lumotini oladi (session.userId).
export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERATOR", "MANAGER"]);
  if (!auth.ok) {
    return new Response(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }
  const session = auth.session;

  const data = await withDbRetry(() => getOperatorDailyStats(session.userId));
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

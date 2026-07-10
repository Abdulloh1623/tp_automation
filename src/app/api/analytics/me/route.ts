import { getSession } from "@/lib/auth";
import { getOperatorDailyStats } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// Feature B — joriy operatorning bugungi ko'rsatkichlari (jonli progress bar).
// Har bir foydalanuvchi faqat o'z ma'lumotini oladi (session.userId).
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!["ADMIN", "OPERATOR", "MANAGER"].includes(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const data = await getOperatorDailyStats(session.userId);
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

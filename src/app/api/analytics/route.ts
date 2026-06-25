import { getSession } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const data = await getAnalytics();
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

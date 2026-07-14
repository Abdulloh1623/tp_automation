import { getSession } from "@/lib/auth";
import { getAnalytics, type Shift } from "@/lib/analytics";
import { withDbRetry } from "@/lib/db-retry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const raw = new URL(req.url).searchParams.get("shift");
  const shift: Shift | undefined = raw === "DAY" || raw === "NIGHT" ? raw : undefined;
  const data = await withDbRetry(() => getAnalytics(shift));
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

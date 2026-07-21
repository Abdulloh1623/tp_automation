import { requireApiSession } from "@/lib/auth";
import { getAnalytics, type Shift } from "@/lib/analytics";
import { withDbRetry } from "@/lib/db-retry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireApiSession(["ADMIN", "MANAGER"]);
  if (!auth.ok) {
    return new Response(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }

  const raw = new URL(req.url).searchParams.get("shift");
  const shift: Shift | undefined = raw === "DAY" || raw === "NIGHT" ? raw : undefined;
  const data = await withDbRetry(() => getAnalytics(shift));
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

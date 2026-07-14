import { getSession } from "@/lib/auth";
import { getOperatorActivity } from "@/lib/analytics";
import { withDbRetry } from "@/lib/db-retry";

export const dynamic = "force-dynamic";

// Feature C — boshliq (ADMIN) uchun barcha operatorlar faolligi (idle detektori).
// Boshqaruv paneli faqat ADMIN'ga ochiq, shu bilan mos ravishda cheklangan.
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const data = await withDbRetry(() => getOperatorActivity());
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

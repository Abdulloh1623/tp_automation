import { requireApiSession } from "@/lib/auth";
import { getOperatorActivity } from "@/lib/analytics";
import { withDbRetry } from "@/lib/db-retry";

export const dynamic = "force-dynamic";

// Feature C — boshliq (ADMIN) uchun barcha operatorlar faolligi (idle detektori).
// Boshqaruv paneli faqat ADMIN'ga ochiq, shu bilan mos ravishda cheklangan.
export async function GET() {
  const auth = await requireApiSession(["ADMIN"]);
  if (!auth.ok) {
    return new Response(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }

  const data = await withDbRetry(() => getOperatorActivity());
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

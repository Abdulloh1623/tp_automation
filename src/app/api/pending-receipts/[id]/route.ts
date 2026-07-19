import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { readReceipt } from "@/lib/receipts";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

// Telegramdan kelgan, hali tasdiqlanmagan chek. Mijoz hali biriktirilmagani
// uchun egalik tekshiruvi yo'q — shu sababli faqat STAFF ko'ra oladi.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (!STAFF.includes(session.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const pending = await db.pendingPayment.findUnique({
    where: { id },
    select: { receiptPath: true },
  });
  if (!pending?.receiptPath) return new NextResponse("Not found", { status: 404 });

  const file = await readReceipt(pending.receiptPath);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      // PDF ham brauzerda ochilsin (yuklab olishga majburlamaymiz)
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

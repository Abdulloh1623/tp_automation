import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { readReceipt } from "@/lib/receipts";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

// Karta to'lovi tasdig'ini kutayotgan chek. To'lov hali yozilmagani uchun
// `Payment` yo'q — fayl `PendingCardPayment.receiptPath` da turadi.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(STAFF);
  if (!auth.ok) {
    return new NextResponse(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }

  const { id } = await params;
  const req = await db.pendingCardPayment.findUnique({
    where: { id },
    select: { receiptPath: true },
  });
  if (!req?.receiptPath) return new NextResponse("Not found", { status: 404 });

  const file = await readReceipt(req.receiptPath);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

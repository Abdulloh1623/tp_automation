import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { readReceipt } from "@/lib/receipts";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

// Himoyalangan chek rasmi: faqat STAFF ko'ra oladi.
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
  const payment = await db.payment.findUnique({
    where: { id },
    select: { receiptPath: true, client: { select: { assignedToId: true } } },
  });
  if (!payment?.receiptPath) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Egalik: OPERATOR faqat o'z mijozining chekini ko'ra oladi (mavjud emasdek 404)
  if (session.role === "OPERATOR" && payment.client.assignedToId !== session.userId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await readReceipt(payment.receiptPath);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

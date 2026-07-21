import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { readHandoutDoc } from "@/lib/handout-docs";

// Faqat ombor/boshqaruv xodimi topshirish hujjatini ko'ra oladi.
const MANAGERS = ["ADMIN", "MANAGER"];

// Himoyalangan topshirish hujjati: movement id bo'yicha signedDocUrl'ni o'qiydi.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(MANAGERS);
  if (!auth.ok) {
    return new NextResponse(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }

  const { id } = await params;
  const movement = await db.equipmentMovement.findUnique({
    where: { id },
    select: { signedDocUrl: true },
  });
  if (!movement?.signedDocUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await readHandoutDoc(movement.signedDocUrl);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

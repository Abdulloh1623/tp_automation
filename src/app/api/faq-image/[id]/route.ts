import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { readFaqImage } from "@/lib/faq-docs";

// Himoyalangan FAQ skrinshoti: fayl nomi (uuid.ext) bo'yicha beradi. Barcha
// tizimga kirgan xodim (ADMIN/OPERATOR/MANAGER) ko'ra oladi — FAQ umumiy.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession(["ADMIN", "OPERATOR", "MANAGER"]);
  if (!auth.ok) {
    return new NextResponse(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }

  const { id } = await params;
  const file = await readFaqImage(id);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=86400",
    },
  });
}

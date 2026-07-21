import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { readSoliqDoc } from "@/lib/soliq-docs";

const MANAGERS = ["ADMIN", "MANAGER"];

// Himoyalangan soliqqa ulash hujjati: fayl nomi (uuid.ext) bo'yicha topib beradi.
// Admin/menejer barchasini; operator faqat o'zi yuborgan arizaning hujjatini ko'radi.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return new NextResponse(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }
  const session = auth.session;

  const { id } = await params;
  const relPath = `soliq/${id}`;
  const tc = await db.taxConnection.findFirst({
    where: { OR: [{ certificatePath: relPath }, { documentPath: relPath }] },
    select: { byUserId: true },
  });
  if (!tc) return new NextResponse("Not found", { status: 404 });

  const allowed =
    MANAGERS.includes(session.role) ||
    (session.role === "OPERATOR" && tc.byUserId === session.userId);
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const file = await readSoliqDoc(relPath);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

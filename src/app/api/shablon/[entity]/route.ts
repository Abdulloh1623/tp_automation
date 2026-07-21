import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { ENTITIES, isBulkEntity, templateFileName } from "@/lib/bulk/entities";
import { buildTemplate } from "@/lib/bulk/template";

// Ommaviy yuklash shabloni (XLSX). Faqat ADMIN — bo'limning o'zi ham ADMIN-only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const auth = await requireApiSession(["ADMIN"]);
  if (!auth.ok) {
    return new NextResponse(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }

  const { entity } = await params;
  if (!isBulkEntity(entity)) return new NextResponse("Not found", { status: 404 });

  const buf = await buildTemplate(ENTITIES[entity]);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${templateFileName(entity)}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildReportPdf } from "@/lib/report-pdf";

const ALLOWED = ["ADMIN", "MANAGER"];

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (!ALLOWED.includes(session.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const pdf = await buildReportPdf();
  const name = `hisobot-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

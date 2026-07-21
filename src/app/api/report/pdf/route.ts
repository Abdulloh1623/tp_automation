import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { buildReportPdf } from "@/lib/report-pdf";

const ALLOWED = ["ADMIN", "MANAGER"];

export async function GET() {
  const auth = await requireApiSession(ALLOWED);
  if (!auth.ok) {
    return new NextResponse(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
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

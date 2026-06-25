"use server";

import { requireSession } from "@/lib/auth";
import { buildReport, buildReportAlbum, type ReportKind } from "@/lib/reports";
import { sendToChannel, sendAlbumToChannel } from "@/lib/telegram";

export type SendState = { ok: boolean; mode?: string; error?: string };

/** Admin/manager: hisobot albomini darhol Telegram kanaliga yuboradi. */
export async function sendReportNow(kind: ReportKind): Promise<SendState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  try {
    const album = await buildReportAlbum(kind);
    const res = await sendAlbumToChannel(album.images);
    if (res.ok) return { ok: true, mode: res.mode };
    const t = await sendToChannel(await buildReport(kind)); // albom xato — matn zaxira
    return { ok: t.ok, mode: t.mode, error: t.error };
  } catch {
    const t = await sendToChannel(await buildReport(kind)); // render xato — matn zaxira
    return { ok: t.ok, mode: t.mode, error: t.error };
  }
}

"use server";

import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendDailyReminders } from "@/lib/reminders";

export type SendRemindersState = {
  ok?: boolean;
  message?: string;
  error?: string;
};

/** Qo'lda eslatma yuborish (ADMIN/MANAGER). */
export async function sendRemindersNow(
  _prev: SendRemindersState,
  _formData: FormData,
): Promise<SendRemindersState> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { error: g.error };

  try {
    const r = await sendDailyReminders();
    await logAudit("Eslatmalar qo'lda yuborildi", {
      entity: "User",
      detail: `operatorlar: ${r.operators.sent} yuborildi / ${r.operators.skipped} o'tkazildi / ${r.operators.noTelegram} telegramsiz; boshliq: ${r.managers.sent} (${r.managers.mode})`,
    });
    const msg =
      `Operatorlarga: ${r.operators.sent} yuborildi` +
      (r.operators.noTelegram ? `, ${r.operators.noTelegram} ta Telegram ulamagan` : "") +
      (r.operators.skipped ? `, ${r.operators.skipped} ta ishsiz` : "") +
      `. Boshliqqa: ${r.managers.sent} (${r.managers.mode === "channel" ? "kanal" : r.managers.mode === "dm" ? "DM" : "yuborilmadi"}).`;
    return { ok: true, message: msg };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Xatolik" };
  }
}

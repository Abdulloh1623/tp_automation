"use server";

import { guardRole } from "@/lib/auth";
import { createBackup } from "@/lib/backup";
import { logAudit } from "@/lib/audit";

export type BackupState = { ok: boolean; info?: string; error?: string };

/** Admin: qo'lda backup yaratadi. */
export async function runBackupNow(): Promise<BackupState> {
  const g = await guardRole(["ADMIN"]);
  if (!g.ok) return { ok: false, error: g.error };

  const res = await createBackup();
  if (!res.ok) return { ok: false, error: res.error };

  await logAudit("Backup yaratildi", {
    entity: "User",
    detail: `${res.name} · cheklar: ${res.receipts} · Telegram: ${res.telegram}`,
  });
  return {
    ok: true,
    info: `${res.name} (cheklar: ${res.receipts}, Telegram: ${res.telegram})`,
  };
}

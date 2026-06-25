"use client";

import { useState, useTransition } from "react";
import { DatabaseBackup, Check, AlertCircle } from "lucide-react";
import { runBackupNow } from "@/actions/backup";
import { Button } from "@/components/ui/button";

export function BackupButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const res = await runBackupNow();
      setMsg(
        res.ok
          ? { ok: true, text: `Backup tayyor: ${res.info}` }
          : { ok: false, text: res.error ?? "Xatolik" },
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        <DatabaseBackup className="h-4 w-4" />
        {pending ? "Backup..." : "Hozir backup"}
      </Button>
      {msg && (
        <span
          className={
            "inline-flex items-center gap-1 text-sm " +
            (msg.ok ? "text-emerald-600" : "text-red-600")
          }
        >
          {msg.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </span>
      )}
    </div>
  );
}

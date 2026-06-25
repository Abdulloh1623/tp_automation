"use client";

import { useState, useTransition } from "react";
import { Send, Check, AlertCircle } from "lucide-react";
import { sendReportNow } from "@/actions/telegram";
import { Button } from "@/components/ui/button";
import type { ReportKind } from "@/lib/reports";

const KINDS: { key: ReportKind; label: string }[] = [
  { key: "daily", label: "Kunlik" },
  { key: "weekly", label: "Haftalik" },
  { key: "monthly", label: "Oylik" },
];

export function SendReportButtons() {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<ReportKind | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function send(kind: ReportKind) {
    setMsg(null);
    setBusy(kind);
    start(async () => {
      const res = await sendReportNow(kind);
      setBusy(null);
      if (res.ok) {
        setMsg({
          ok: true,
          text:
            res.mode === "log"
              ? "Yuborildi (log rejimi — kanal IDsi sozlanmagan)"
              : "Telegram kanaliga yuborildi",
        });
      } else {
        setMsg({ ok: false, text: res.error ?? "Xatolik" });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">Telegramga:</span>
      {KINDS.map((k) => (
        <Button
          key={k.key}
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => send(k.key)}
        >
          <Send className="h-3.5 w-3.5" />
          {busy === k.key ? "..." : k.label}
        </Button>
      ))}
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

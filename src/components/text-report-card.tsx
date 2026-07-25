"use client";

// Rahbarga topshirish uchun matnli kunlik hisobot — o'qib/nusxalab olsa bo'ladi.
// "Nusxa olish" tugmasi butun matnni clipboard'ga ko'chiradi (Telegram/eslatmaga
// tashlash uchun). Matn server tomonda tayyorlanadi (report-text.ts).

import { useState } from "react";
import { Copy, Check, FileText } from "lucide-react";
import { toast } from "@/components/toaster";

export function TextReportCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Hisobot nusxalandi", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Nusxalab bo'lmadi", "error");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800/70 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500/15 to-primary-500/5 text-primary-600 ring-1 ring-inset ring-primary-500/20 dark:text-primary-400">
            <FileText className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
            Kunlik hisobot (matn)
          </h2>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          {copied ? "Nusxalandi" : "Nusxa olish"}
        </button>
      </div>
      <div className="p-4 sm:p-5">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {text}
        </pre>
      </div>
    </section>
  );
}

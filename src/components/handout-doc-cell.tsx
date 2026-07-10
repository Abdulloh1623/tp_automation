"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Loader2, Check } from "lucide-react";
import { uploadHandoutFile, uploadSignedDocument } from "@/actions/inventory";
import { documentStatusLabel } from "@/lib/constants";

/**
 * Harakatlar jurnalidagi hujjat holati katagi. PENDING_DOC bo'lsa sariq badge
 * ("Imzo kutilmoqda") + yuklash tugmasi ko'rsatiladi; hujjat yuklangach yashil
 * badge + "Ko'rish" havolasi bo'ladi.
 */
export function HandoutDocCell({
  movementId,
  documentStatus,
  hasDoc,
}: {
  movementId: string;
  documentStatus: string | null;
  hasDoc: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Taqsimotga aloqador emas (kirim/brak/...) — hujjat tushunchasi yo'q.
  if (!documentStatus || documentStatus === "NOT_REQUIRED") {
    return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  }

  const uploaded = hasDoc || documentStatus === "UPLOADED" || documentStatus === "APPROVED";

  if (uploaded) {
    return (
      <a
        href={`/api/handouts/${movementId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
      >
        <Check className="h-3.5 w-3.5" /> {documentStatusLabel(documentStatus)} · Ko'rish
      </a>
    );
  }

  // PENDING_DOC — sariq badge + imzolangan hujjatni yuklash.
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // bir xil faylni qayta tanlashga ruxsat
    if (!file) return;
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const up = await uploadHandoutFile(fd);
      if (!up.ok || !up.url) {
        setErr(up.error ?? "Yuklashda xatolik");
        return;
      }
      const res = await uploadSignedDocument(movementId, up.url);
      if (!res.ok) {
        setErr(res.error ?? "Xatolik");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <FileText className="h-3.5 w-3.5" /> Imzo kutilmoqda
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Yuklash
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
          className="hidden"
          onChange={onPick}
        />
      </div>
      {err && <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span>}
    </div>
  );
}

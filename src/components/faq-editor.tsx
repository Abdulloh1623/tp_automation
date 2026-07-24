"use client";

import { useRef, useState } from "react";
import { Bold, Italic, Link2, ImagePlus, Eye, Pencil, Loader2 } from "lucide-react";
import { uploadFaqImage } from "@/actions/faq";
import { MarkdownView } from "@/lib/markdown";
import { toast } from "@/components/toaster";

/**
 * Cheklangan markdown muharriri: qalin/kursiv/havola tugmalari + skrinshot
 * yuklash yoki paste (Ctrl+V) + jonli ko'rib chiqish. Qiymatni onChange orqali
 * beradi (parent forma FormData'ga yig'adi).
 */
export function FaqEditor({
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);

  function surround(before: string, after: string, fallback: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || fallback;
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    onChange(next);
    // Tanlovni ichki matnga qo'yamiz
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  }

  function insert(text: string) {
    const ta = ref.current;
    if (!ta) {
      onChange(value + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await uploadFaqImage(fd);
      if (res.ok) {
        insert(`\n![skrinshot](${res.url})\n`);
      } else {
        toast(res.error || "Rasm yuklanmadi", "error");
      }
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) {
      const blob = item.getAsFile();
      if (blob) {
        e.preventDefault();
        void uploadFile(blob);
      }
    }
  }

  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800";

  return (
    <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800 px-2 py-1">
        <button type="button" className={btn} title="Qalin (**matn**)" onClick={() => surround("**", "**", "qalin")}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Kursiv (*matn*)" onClick={() => surround("*", "*", "kursiv")}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Havola" onClick={() => surround("[", "](https://)", "matn")}>
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          title="Skrinshot yuklash"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? "Tahrir" : "Ko'rish"}
          </button>
        </div>
      </div>

      {preview ? (
        <div className="min-h-[6rem] px-3 py-2 text-sm text-slate-800 dark:text-slate-100">
          {value.trim() ? (
            <MarkdownView text={value} />
          ) : (
            <span className="text-slate-400">Ko'rib chiqish uchun matn kiriting…</span>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-y rounded-b-lg border-0 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
          e.target.value = "";
        }}
      />

      <p className="border-t border-slate-100 dark:border-slate-800 px-3 py-1 text-[11px] text-slate-400">
        **qalin**, *kursiv*, [havola](url) · skrinshotni yuklang yoki bevosita paste qiling (Ctrl+V)
      </p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, ClipboardPaste, X, Image as ImageIcon } from "lucide-react";

/**
 * Chek (rasm) kiritish: fayl yuklash YOKI clipboarddan paste.
 * Tanlangan faylni onChange orqali beradi.
 */
export function ReceiptInput({
  onChange,
}: {
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function setFile(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (file) {
      setPreview(URL.createObjectURL(file));
      setName(file.name);
    } else {
      setPreview(null);
      setName(null);
    }
    onChange(file);
  }

  function fromBlob(blob: Blob) {
    const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
    setFile(new File([blob], `chek.${ext}`, { type: blob.type || "image/png" }));
    setHint(null);
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) {
      const blob = item.getAsFile();
      if (blob) {
        fromBlob(blob);
        e.preventDefault();
      }
    }
  }

  async function pasteFromClipboard() {
    setHint(null);
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) {
          fromBlob(await it.getType(type));
          return;
        }
      }
      setHint("Clipboardda rasm topilmadi");
    } catch {
      setHint("Brauzer ruxsat bermadi — rasm ustiga bosib nusxalang yoki fayl yuklang");
    }
  }

  return (
    <div className="space-y-2">
      {preview ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="chek"
            className="max-h-48 rounded-lg border border-slate-200 dark:border-slate-800"
          />
          <button
            type="button"
            onClick={() => setFile(null)}
            className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white shadow"
            title="O'chirish"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{name}</div>
        </div>
      ) : (
        <div
          tabIndex={0}
          onPaste={onPaste}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400 hover:border-blue-400 focus:border-blue-500 focus:outline-none"
        >
          <ImageIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
          <span>Chek rasmini yuklang yoki bu yerga paste qiling (Ctrl+V)</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Upload className="h-4 w-4" /> Fayl yuklash
        </button>
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ClipboardPaste className="h-4 w-4" /> Clipboarddan
        </button>
      </div>

      {hint && <p className="text-xs text-amber-600 dark:text-amber-400">{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) setFile(f);
        }}
      />
    </div>
  );
}

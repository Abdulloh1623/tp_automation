"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Telefonni probelsiz kanonik ko'rinishga (+998903361623) keltiradi. */
export function canonicalPhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) return "+" + d;
  if (d.length === 9) return "+998" + d;
  if (!d) return "";
  return "+" + d;
}

/**
 * Matnni clipboard'ga nusxalaydi. HTTPS/localhost'da navigator.clipboard,
 * aks holda (prod HTTP) execCommand fallback ishlatiladi.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallbackga o'tamiz */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Ixcham nusxa olish tugmasi — telefonni probelsiz (+998...) nusxalaydi. */
export function PhoneCopyButton({
  phone,
  className,
}: {
  phone: string | null | undefined;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!phone) return null;
  const canon = canonicalPhone(phone);

  async function onCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (await copyText(canon)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Nusxalandi" : `Nusxa olish: ${canon}`}
      aria-label="Telefon raqamini nusxalash"
      className={
        "inline-flex shrink-0 items-center justify-center rounded p-0.5 align-middle transition-colors " +
        (copied
          ? "text-emerald-500 dark:text-emerald-400"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200") +
        (className ? " " + className : "")
      }
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

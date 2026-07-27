"use client";

// Server komponentlardan (mijoz profili, soliq navbati) hujjat ochish uchun
// kichik mijoz-komponent: bosilganda `DocumentViewer` modalini ochadi.
// Xom `<a target="_blank">` o'rniga — fayl kontekst bilan birga ko'rinadi.

import { FileText, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { openDocument, type DocumentOptions } from "@/components/document-viewer";

type Props = DocumentOptions & {
  /** Tugma matni (default — sarlavha) */
  label?: string;
  /** link — matn havola ko'rinishi; chip — yumaloq tugmacha */
  variant?: "link" | "chip";
  icon?: "file" | "receipt";
  className?: string;
};

export function DocumentLink({
  label,
  variant = "link",
  icon = "file",
  className,
  ...doc
}: Props) {
  const Icon = icon === "receipt" ? Receipt : FileText;
  return (
    <button
      type="button"
      onClick={() => openDocument(doc)}
      className={cn(
        "inline-flex items-center gap-1.5 transition-colors",
        variant === "chip"
          ? "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-primary-300 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-primary-400"
          : "text-primary-600 hover:underline dark:text-primary-400",
        className,
      )}
    >
      <Icon className={variant === "chip" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label ?? doc.title}
    </button>
  );
}

"use client";

// Ilovadagi barcha "amal oynalari" uchun yagona qobiq (to'lovni tahrirlash,
// soliqqa ulash, uskuna biriktirish/qaytarish).
//
// Ikki qoida shu yerda bir marta hal qilinadi:
//
//  1. PORTAL — oyna `document.body`ga chiqariladi. Mijoz profili modali
//     (`ProfileModalShell`) `backdrop-blur` ishlatadi, backdrop-filter esa
//     ichidagi `position: fixed` elementlar uchun YANGI containing block
//     yaratadi: busiz oyna viewport'ga emas, uzun profilning scroll
//     konteyneriga nisbatan joylashib, bahaybat va tushunarsiz ochiladi.
//
//  2. BALANDLIK — karta `flex flex-col` + `max-h-[85dvh]`. Sarlavha va
//     amallar paneli joyida qoladi, faqat o'rtadagi kontent scroll bo'ladi;
//     ya'ni forma qanchalik uzun bo'lmasin "Saqlash" tugmasi yo'qolmaydi.
//
// z-index shkalasi: profil modali 50 → amal oynalari 100 → ConfirmDialog 110
// → DocumentViewer 120.

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  note,
  footer,
  children,
  onSubmit,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Sarlavha ostidagi qator — odatda mijoz nomi. */
  subtitle?: string;
  /** Tayyor element uzatiladi (`<Landmark className="h-4 w-4" />`), komponent EMAS. */
  icon?: ReactNode;
  /** Sarlavha ostidagi kontekst tasmasi — hozirgi qiymat yoki qisqa izoh. */
  note?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Berilsa karta `<form>` bo'ladi va tugmalar submit qila oladi. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  size?: "md" | "lg";
}) {
  // Portal faqat brauzerda (SSR'da `document` yo'q)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation(); // orqadagi profil modali ham yopilib ketmasin
        onClose();
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const cardClass = cn(
    "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-black/5 sm:max-h-[85dvh] sm:rounded-2xl dark:border-slate-800 dark:bg-slate-950 dark:ring-white/5",
    size === "lg" ? "max-w-lg" : "max-w-md",
  );

  const inner = (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {subtitle && (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {note && (
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          {note}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">{children}</div>

      {footer && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          {footer}
        </div>
      )}
    </>
  );

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {onSubmit ? (
        <form onSubmit={onSubmit} className={cardClass} onClick={stop}>
          {inner}
        </form>
      ) : (
        <div className={cardClass} onClick={stop}>
          {inner}
        </div>
      )}
    </div>,
    document.body,
  );
}

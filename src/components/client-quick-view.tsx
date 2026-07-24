"use client";

// Mijoz nomi — bosilganda `/mijozlar/[id]` ga SOFT navigatsiya qiladi. Ilova
// ichida bu intercepting route (@modal) tomonidan ushlanib, TO'LIQ profil katta
// blur-modalda ochiladi (sahifadan chiqmasdan) — boshqaruv paneli bilan bir xil.
// To'g'ridan-to'g'ri yuklansa (refresh / yangi tab) oddiy profil sahifasi
// ochiladi. Ctrl/Cmd/o'rta-tugma — yangi tab (Next Link o'zi hal qiladi).
//
// Barcha bo'limlarda bir xil bo'lishi uchun umumiy: ClientLink shu komponentga
// delegatsiya qiladi. (Ilgari kichik "tez ko'rish" modali edi — endi hamma
// joyda to'liq profil ochiladi.)

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Mijoz nomi — bosilganda to'liq profil modalini ochadi (intercepting route).
 */
export function ClientQuickView({
  id,
  name,
  className,
  children,
}: {
  id: string;
  name?: string;
  className?: string;
  /** Havola tarkibi (berilsa `name` o'rniga; default matn stillari qo'llanmaydi). */
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={`/mijozlar/${id}`}
      className={
        children
          ? className
          : cn(
              "font-medium text-slate-900 hover:text-primary-600 hover:underline dark:text-slate-100 dark:hover:text-primary-400",
              className,
            )
      }
    >
      {children ?? name}
    </Link>
  );
}

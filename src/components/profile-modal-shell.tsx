"use client";

// Mijoz profilini (intercepting route) katta blur-modal ichida ko'rsatadi.
//
// Yopish ikki qismdan iborat:
//  1. modal DARHOL yo'qoladi (lokal holat) — `router.back()` orqa sahifani
//     qayta render qilguncha kutmaydi. Ilgari og'ir sahifadan (masalan
//     /tolovlar yoki /lidlar) ochilganda X bosilgach modal bir necha soniya
//     "osilib" turardi va tugma ishlamayotgandek ko'rinardi;
//  2. keyin `router.back()` — URL va orqa sahifa tiklanadi.
//
// Tarixda orqaga qaytadigan yozuv bo'lmasa `back()` hech narsa qilmaydi —
// shu sabab zaxira sifatida mijozlar ro'yxatiga o'tamiz.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function ProfileModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing((prev) => {
      if (!prev) router.back();
      return true;
    });
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Modal ochiq turganda orqa sahifa scroll qilmasin.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  // Zaxira: `back()` ishlamasa (tarix bo'sh) foydalanuvchi bo'sh ekranda
  // qolib ketmasin. Navigatsiya muvaffaqiyatli bo'lsa komponent unmount
  // bo'ladi va timer tozalanadi — ya'ni bu faqat haqiqiy tiqilishda ishlaydi.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => router.replace("/mijozlar"), 700);
    return () => clearTimeout(t);
  }, [closing, router]);

  if (closing) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-2 backdrop-blur-md sm:p-6"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      {/* Yopish tugmasi — OVERLAY'ning bevosita bolasi va `fixed`: uzun profilda
          pastga aylantirilganda ham doim ko'rinib turadi. Ilgari u karta ichida
          `absolute` edi va scroll bilan tepada qolib ketardi — "X ishlamayapti"
          shikoyatining asosiy sababi shu. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        aria-label="Yopish"
        className="fixed right-3 top-3 z-[60] rounded-full bg-slate-900/70 p-2 text-white shadow-lg ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-slate-900 sm:right-6 sm:top-6"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-950 dark:ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hi-Tech aksent chizig'i */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-primary-500/70 to-transparent" />
        <div className="p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

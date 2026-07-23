"use client";

// Mijoz profilini (intercepting route) katta blur-modal ichida ko'rsatadi.
// Yopish → router.back() (avvalgi sahifaga qaytadi; URL ham tiklanadi).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function ProfileModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    // Modal ochiq turганда orqa sahifa scroll qilmasin.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-3 backdrop-blur-md sm:p-6"
      onClick={() => router.back()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => router.back()}
          aria-label="Yopish"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/80 p-1.5 text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur hover:text-slate-800 dark:bg-slate-800/80 dark:text-slate-400 dark:ring-slate-700 dark:hover:text-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

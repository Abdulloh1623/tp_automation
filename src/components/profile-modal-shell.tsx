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
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-2 backdrop-blur-md sm:p-6"
      onClick={() => router.back()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-950 dark:ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hi-Tech aksent chizig'i */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-primary-500/70 to-transparent" />
        <button
          onClick={() => router.back()}
          aria-label="Yopish"
          className="absolute right-3 top-3 z-20 rounded-full bg-white/10 p-1.5 text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

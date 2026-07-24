"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType; leaving: boolean };

const EVENT = "app-toast";

/** Istalgan joydan toast chiqarish: toast("Saqlandi", "success"). */
export function toast(message: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

// Hi-Tech ko'rinish: qorong'i shishasimon karta + tonli halqa/nur + ikon.
const TONE: Record<
  ToastType,
  { ring: string; glow: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    ring: "ring-emerald-400/40",
    glow: "shadow-[0_0_45px_-8px_rgba(16,185,129,.55)]",
    icon: "bg-emerald-500/15 text-emerald-400",
    Icon: CheckCircle2,
  },
  error: {
    ring: "ring-rose-400/40",
    glow: "shadow-[0_0_45px_-8px_rgba(244,63,94,.55)]",
    icon: "bg-rose-500/15 text-rose-400",
    Icon: AlertCircle,
  },
  info: {
    ring: "ring-sky-400/40",
    glow: "shadow-[0_0_45px_-8px_rgba(56,189,248,.55)]",
    icon: "bg-sky-500/15 text-sky-400",
    Icon: Info,
  },
};

// Markazda ko'rinadi va 2 soniya turadi (keyin silliq chiqib ketadi).
const VISIBLE_MS = 2000;
const EXIT_MS = 220;

let counter = 0;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, type } = (e as CustomEvent).detail as {
        message: string;
        type: ToastType;
      };
      const id = ++counter;
      setItems((prev) => [...prev, { id, message, type, leaving: false }]);
      setTimeout(() => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
        );
      }, VISIBLE_MS);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, VISIBLE_MS + EXIT_MS);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 p-4">
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translateY(10px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes toastOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.96); } }
        .toast-in { animation: toastIn .2s cubic-bezier(.16,1,.3,1) both; }
        .toast-out { animation: toastOut .22s ease-in both; }
        @media (prefers-reduced-motion: reduce) { .toast-in, .toast-out { animation-duration: .01ms; } }
      `}</style>
      {items.map((t) => {
        const { ring, glow, icon, Icon } = TONE[t.type];
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={
              "flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-4 text-white shadow-2xl ring-1 backdrop-blur-xl " +
              ring +
              " " +
              glow +
              " " +
              (t.leaving ? "toast-out" : "toast-in")
            }
          >
            <span
              className={
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
                icon
              }
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium leading-snug">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

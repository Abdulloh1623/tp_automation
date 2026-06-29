"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (default) — qizil tasdiq; "primary" — ko'k. */
  variant?: "danger" | "primary";
};
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const EVENT = "app-confirm";

/**
 * Istalgan joydan tasdiqlash so'rash (window.confirm o'rniga):
 *   if (await confirmDialog({ title: "O'chirilsinmi?" })) { ... }
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...opts, resolve } }));
  });
}

/** Bir marta (layout'da) joylashtiriladigan host — Toaster kabi. */
export function ConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    function onConfirm(e: Event) {
      setPending((e as CustomEvent).detail as Pending);
    }
    window.addEventListener(EVENT, onConfirm);
    return () => window.removeEventListener(EVENT, onConfirm);
  }, []);

  const close = useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  if (!pending) return null;
  const danger = pending.variant !== "primary"; // ko'pchilik tasdiqlar — xavfli amal

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
      onClick={() => close(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              danger
                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                : "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {pending.title}
            </h2>
            {pending.message && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{pending.message}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => close(false)}
            autoFocus={danger}
          >
            {pending.cancelLabel ?? "Bekor"}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={() => close(true)}
            autoFocus={!danger}
          >
            {pending.confirmLabel ?? "Tasdiqlash"}
          </Button>
        </div>
      </div>
    </div>
  );
}

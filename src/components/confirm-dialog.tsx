"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (default) — qizil tasdiq; "primary" — ko'k. */
  variant?: "danger" | "primary";
  /**
   * Berilsa oynada izoh maydoni chiqadi. Izoh HAR DOIM IXTIYORIY — bo'sh
   * qoldirib tasdiqlash mumkin, tugma hech qachon bloklanmaydi.
   */
  note?: { label?: string; placeholder?: string };
};
export type ConfirmResult = { ok: boolean; note: string };
type Pending = ConfirmOptions & { resolve: (r: ConfirmResult) => void };

const EVENT = "app-confirm";

function request(opts: ConfirmOptions): Promise<ConfirmResult> {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, note: "" });
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...opts, resolve } }));
  });
}

/**
 * Istalgan joydan tasdiqlash so'rash (window.confirm o'rniga):
 *   if (await confirmDialog({ title: "O'chirilsinmi?" })) { ... }
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return request(opts).then((r) => r.ok);
}

/**
 * Tasdiqlash + IXTIYORIY izoh. Amal yakunlanayotganda (muammo/eskalatsiya/taklif
 * hal bo'ldi, uskuna qaytarib olindi) xodim xohlasa izoh qoldiradi, xohlamasa —
 * shunchaki tasdiqlaydi:
 *   const { ok, note } = await confirmWithNote({ title: "...", note: {} });
 */
export function confirmWithNote(
  opts: ConfirmOptions & { note: NonNullable<ConfirmOptions["note"]> },
): Promise<ConfirmResult> {
  return request(opts);
}

/** Bir marta (layout'da) joylashtiriladigan host — Toaster kabi. */
export function ConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    function onConfirm(e: Event) {
      // Har bir yangi so'rovda izoh maydoni toza boshlanadi.
      setNote("");
      setPending((e as CustomEvent).detail as Pending);
    }
    window.addEventListener(EVENT, onConfirm);
    return () => window.removeEventListener(EVENT, onConfirm);
  }, []);

  // Izoh matni `close` ga argument sifatida uzatiladi: state'ni callback
  // ichidan o'qish eskirgan qiymatni berishi mumkin.
  const close = useCallback((ok: boolean, noteText = "") => {
    setPending((p) => {
      p?.resolve({ ok, note: ok ? noteText.trim() : "" });
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
  const noteOpts = pending.note;
  const Icon = noteOpts && !danger ? CheckCircle2 : AlertTriangle;

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
                : "bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-400",
            )}
          >
            <Icon className="h-5 w-5" />
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

        {noteOpts && (
          <div className="mt-4">
            <label
              htmlFor="confirm-note"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              {noteOpts.label ?? "Izoh"}{" "}
              <span className="font-normal text-slate-400 dark:text-slate-500">(ixtiyoriy)</span>
            </label>
            <textarea
              id="confirm-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={noteOpts.placeholder ?? "Xohlasangiz qisqacha yozing"}
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => close(false)}
            autoFocus={danger && !noteOpts}
          >
            {pending.cancelLabel ?? "Bekor"}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={() => close(true, note)}
            autoFocus={!danger && !noteOpts}
          >
            {pending.confirmLabel ?? "Tasdiqlash"}
          </Button>
        </div>
      </div>
    </div>
  );
}

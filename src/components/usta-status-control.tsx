"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import {
  updateUstaStatus,
  blockUstaTask,
  unblockUstaTask,
} from "@/actions/usta";
import { confirmWithNote } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

const STAGES: { key: string; label: string }[] = [
  { key: "ASSIGNED", label: "Biriktirildi" },
  { key: "EN_ROUTE", label: "Yo'ldaman" },
  { key: "ARRIVED", label: "Bordim" },
];

/**
 * Boshliq usta nomidan (yoki usta o'zi) vazifa holatini yangilaydi. Har bir
 * kartada FAQAT ikkita yo'nalish tugmasi (keyingi/oldingi bosqich) + alohida
 * "Hal bo'lmadi" tugmasi — telefondan foydalanuvchi ustaga qulay bo'lishi
 * uchun (bosqich nomlarini eslab yurish shart emas).
 */
export function UstaStatusControl({
  clientId,
  current,
  blocked = false,
  blockedNote,
}: {
  clientId: string;
  current: string | null;
  blocked?: boolean;
  blockedNote?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const idx = Math.max(
    0,
    STAGES.findIndex((s) => s.key === (current ?? "ASSIGNED")),
  );

  function run(status: string, note?: string) {
    setErr(null);
    start(async () => {
      const res = await updateUstaStatus(clientId, status, note);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Xatolik");
    });
  }

  async function onDone() {
    const { ok, note } = await confirmWithNote({
      title: "Vazifa bajarildi",
      confirmLabel: "Bajarildi",
      variant: "primary",
      note: {
        label: "Qanday hal qilindi",
        placeholder: "Masalan: joyida sozlab berdi",
        required: true,
      },
    });
    if (ok) run("DONE", note);
  }

  function goNext() {
    if (idx === STAGES.length - 1) {
      onDone();
      return;
    }
    run(STAGES[idx + 1].key);
  }

  function goPrev() {
    if (idx === 0) return;
    run(STAGES[idx - 1].key);
  }

  async function onFlag() {
    const { ok, note } = await confirmWithNote({
      title: "Hal bo'lmadi / Muammo bor",
      confirmLabel: "Belgilash",
      note: {
        label: "Nima uchun?",
        placeholder: "Masalan: mijoz telefon ko'targani yo'q",
        required: true,
      },
    });
    if (!ok) return;
    setErr(null);
    start(async () => {
      const res = await blockUstaTask(clientId, note);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Xatolik");
    });
  }

  function onRetry() {
    setErr(null);
    start(async () => {
      const res = await unblockUstaTask(clientId);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Xatolik");
    });
  }

  if (blocked) {
    return (
      <div className="space-y-2">
        {blockedNote && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
            {blockedNote}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onRetry}
        >
          ↺ Qayta urinish
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {err && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {err}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={pending} onClick={goNext}>
          {idx === STAGES.length - 1
            ? "Bajarildi"
            : `${STAGES[idx + 1].label} →`}
        </Button>
        {idx > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={goPrev}
          >
            ← {STAGES[idx - 1].label}
          </Button>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-dashed text-red-600 dark:text-red-400"
        disabled={pending}
        onClick={onFlag}
      >
        ⚠ Hal bo'lmadi / Muammo bor
      </Button>
    </div>
  );
}

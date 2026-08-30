"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, PackageCheck, AlertCircle } from "lucide-react";
import {
  startReturnProgress,
  confirmReturnCollected,
  revertReturnRequest,
  blockReturnRequest,
  unblockReturnRequest,
} from "@/actions/equipment";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";

/**
 * Usta o'zi: qaytarish arizasini bosqichma-bosqich olib boradi. Har bir
 * kartada FAQAT ikkita yo'nalish tugmasi (keyingi/oldingi bosqich) + alohida
 * "Hal bo'lmadi" tugmasi.
 */
export function UstaReturnActions({
  requestId,
  status,
  blocked = false,
  blockedNote,
}: {
  requestId: string;
  status: string;
  blocked?: boolean;
  blockedNote?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg?: string,
  ) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (okMsg) toast(okMsg, "success");
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
      }
    });
  }

  async function onStart() {
    const { ok, note } = await confirmWithNote({
      title: "Yo'lga chiqdim",
      confirmLabel: "Boshladim",
      variant: "primary",
      note: {
        label: "Izoh",
        placeholder: "Masalan: mijozga qo'ng'iroq qildim",
        required: true,
      },
    });
    if (ok)
      run(() => startReturnProgress(requestId, note), "Jarayonga o'tkazildi");
  }

  async function onDone() {
    const { ok, note } = await confirmWithNote({
      title: "Uskuna olib kelindi",
      confirmLabel: "Yakunlash",
      variant: "primary",
      note: {
        label: "Izoh (uskuna holati)",
        placeholder: "Masalan: yaxshi holatda",
        required: true,
      },
    });
    if (ok)
      run(() => confirmReturnCollected(requestId, note), "Ariza yakunlandi");
  }

  function onPrev() {
    run(() => revertReturnRequest(requestId));
  }

  async function onFlag() {
    const { ok, note } = await confirmWithNote({
      title: "Hal bo'lmadi / Muammo bor",
      confirmLabel: "Belgilash",
      note: {
        label: "Nima uchun?",
        placeholder: "Masalan: manzilga bordim, eshik yopiq",
        required: true,
      },
    });
    if (ok) run(() => blockReturnRequest(requestId, note));
  }

  function onRetry() {
    run(() => unblockReturnRequest(requestId));
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
          type="button"
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
        {status === "APPROVED" && (
          <Button type="button" size="sm" disabled={pending} onClick={onStart}>
            <Truck className="h-3.5 w-3.5" /> Yo'lga chiqdim
          </Button>
        )}
        {status === "IN_PROGRESS" && (
          <>
            <Button type="button" size="sm" disabled={pending} onClick={onDone}>
              <PackageCheck className="h-3.5 w-3.5" /> Uskuna olib kelindi
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onPrev}
            >
              ← Biriktirilgan
            </Button>
          </>
        )}
      </div>
      <Button
        type="button"
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

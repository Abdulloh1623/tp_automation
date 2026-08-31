"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTicketStatus, blockTicket, unblockTicket } from "@/actions/tickets";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";

/**
 * Oddiy muammo (Texnik/Funksiya/To'lov/Soliq) ticketlari uchun ustaning
 * yakunlash boshqaruvi — `VersionTicketStatusControl`ning nusxasi, faqat
 * versiya tanlash o'rniga erkin izohli yakunlash (`setTicketStatus`).
 * Har bir kartada ikkita yo'nalish tugmasi (keyingi/oldingi bosqich) +
 * alohida "Hal bo'lmadi" tugmasi — bo'lim ichidagi holat vokabulyarini
 * eslab qolish shart bo'lmasligi uchun.
 */
export function UstaTicketStatusControl({
  ticketId,
  status,
  blocked = false,
  blockedNote,
}: {
  ticketId: string;
  status: string;
  blocked?: boolean;
  blockedNote?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onStart() {
    start(async () => {
      const fd = new FormData();
      const res = await setTicketStatus(ticketId, "IN_PROGRESS", fd);
      if (res.ok) {
        toast("Jarayonga olindi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  async function onResolve() {
    const { ok, note } = await confirmWithNote({
      title: "Muammo hal qilindimi?",
      confirmLabel: "Hal qildim",
      note: { label: "Yechim izohi", required: true },
    });
    if (!ok) return;
    start(async () => {
      const fd = new FormData();
      fd.set("resolutionNote", note);
      const res = await setTicketStatus(ticketId, "RESOLVED", fd);
      if (res.ok) {
        toast("Muammo hal qilindi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  async function onReopen() {
    const { ok, note } = await confirmWithNote({
      title: "Ochiqqa qaytarish",
      confirmLabel: "Qaytarish",
      note: { label: "Nima uchun qaytarilmoqda", required: true },
    });
    if (!ok) return;
    start(async () => {
      const fd = new FormData();
      fd.set("resolutionNote", note);
      const res = await setTicketStatus(ticketId, "OPEN", fd);
      if (res.ok) {
        toast("Muammo qayta ochildi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  async function onFlag() {
    const { ok, note } = await confirmWithNote({
      title: "Hal bo'lmadi / Muammo bor",
      confirmLabel: "Belgilash",
      note: {
        label: "Nima uchun?",
        placeholder: "Masalan: ehtiyot qism kerak, mijoz joyida yo'q",
        required: true,
      },
    });
    if (!ok) return;
    start(async () => {
      const res = await blockTicket(ticketId, note);
      if (res.ok) router.refresh();
      else toast(res.error ?? "Xatolik", "error");
    });
  }

  function onRetry() {
    start(async () => {
      const res = await unblockTicket(ticketId);
      if (res.ok) router.refresh();
      else toast(res.error ?? "Xatolik", "error");
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
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onRetry}>
          ↺ Qayta urinish
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {status === "OPEN" && (
        <Button type="button" size="sm" disabled={pending} onClick={onStart}>
          Boshladim →
        </Button>
      )}
      {status === "IN_PROGRESS" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={onResolve}>
            Hal qildim →
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onReopen}>
            ← Ochiq
          </Button>
        </div>
      )}
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

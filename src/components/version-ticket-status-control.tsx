"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import {
  resolveVersionTicket,
  setTicketStatus,
  blockTicket,
  unblockTicket,
} from "@/actions/tickets";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CLIENT_APP_VERSIONS, clientAppVersionLabel } from "@/lib/constants";

/**
 * "Yangi versiya" so'rovlari uchun yakunlash boshqaruvi — umumiy
 * `TicketStatusControl`dan farqli, erkin izoh o'rniga mijozga o'rnatilgan
 * ANIQ versiyani so'raydi (tanlangach `Client.appVersion` ham yangilanadi).
 * Har bir kartada FAQAT ikkita yo'nalish tugmasi (keyingi/oldingi bosqich) +
 * alohida "Hal bo'lmadi" tugmasi.
 */
export function VersionTicketStatusControl({
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
  const [version, setVersion] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function resolve() {
    setErr(null);
    start(async () => {
      const res = await resolveVersionTicket(ticketId, version);
      if (res.ok) {
        toast(
          `Versiya yangilandi: ${clientAppVersionLabel(version)}`,
          "success",
        );
        setVersion("");
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
      }
    });
  }

  function onStart() {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      const res = await setTicketStatus(ticketId, "IN_PROGRESS", fd);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Xatolik");
    });
  }

  async function onReopen() {
    const { ok, note } = await confirmWithNote({
      title: "Ochiqqa qaytarish",
      confirmLabel: "Qaytarish",
      note: { label: "Nima uchun qaytarilmoqda", required: true },
    });
    if (!ok) return;
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("resolutionNote", note);
      const res = await setTicketStatus(ticketId, "OPEN", fd);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Xatolik");
    });
  }

  async function onReopenFromDone() {
    const { ok, note } = await confirmWithNote({
      title: "Muammoni qayta ochish",
      confirmLabel: "Qayta ochish",
      note: { label: "Nima uchun qayta ochilmoqda", required: true },
    });
    if (!ok) return;
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("resolutionNote", note);
      const res = await setTicketStatus(ticketId, "OPEN", fd);
      if (res.ok) {
        toast("Muammo qayta ochildi", "success");
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
      }
    });
  }

  async function onFlag() {
    const { ok, note } = await confirmWithNote({
      title: "Hal bo'lmadi / Muammo bor",
      confirmLabel: "Belgilash",
      note: {
        label: "Nima uchun?",
        placeholder: "Masalan: mijoz ilovani yangilashga rozi emas",
        required: true,
      },
    });
    if (!ok) return;
    setErr(null);
    start(async () => {
      const res = await blockTicket(ticketId, note);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Xatolik");
    });
  }

  function onRetry() {
    setErr(null);
    start(async () => {
      const res = await unblockTicket(ticketId);
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

  if (status === "RESOLVED") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={onReopenFromDone}
      >
        ← Qayta ochish
      </Button>
    );
  }

  return (
    <div className="space-y-1.5">
      {err && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {err}
        </div>
      )}
      {status === "OPEN" && (
        <Button type="button" size="sm" disabled={pending} onClick={onStart}>
          Boshladim →
        </Button>
      )}
      {status === "IN_PROGRESS" && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="h-8 w-40 text-xs"
          >
            <option value="">Yangi versiya…</option>
            {CLIENT_APP_VERSIONS.map((v) => (
              <option key={v} value={v}>
                {clientAppVersionLabel(v)}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={pending || !version}
            onClick={resolve}
          >
            Yangilandi →
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onReopen}
          >
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

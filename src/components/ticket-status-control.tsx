"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTicketStatus } from "@/actions/tickets";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ChainStep = { key: string; label: string };

/**
 * Muammoning ish-holati — dinamik zanjir bo'yicha (Yangi → admin qo'shgan
 * ish-bosqichlari, /sozlamalar → Hal qilindi). Har bir kartada FAQAT ikkita
 * yo'nalish tugmasi (keyingi/oldingi bosqich, izohsiz) + alohida "Hal
 * qilindi" (izoh MAJBURIY, istalgan bosqichdan to'g'ridan-to'g'ri) va
 * "Qayta ochish" (yakundan, izoh MAJBURIY).
 */
export function TicketStatusControl({
  ticketId,
  status,
  chain,
}: {
  ticketId: string;
  status: string;
  chain: ChainStep[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolutionNote, setResolutionNote] = useState("");

  function change(next: string, note: string, okMsg: string) {
    start(async () => {
      const fd = new FormData();
      if (note) fd.set("resolutionNote", note);
      const res = await setTicketStatus(ticketId, next, fd);
      if (res.ok) {
        toast(okMsg, "success");
        setResolutionNote("");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  async function onReopen() {
    const { ok, note } = await confirmWithNote({
      title: "Muammoni qayta ochish",
      confirmLabel: "Qayta ochish",
      note: { label: "Nima uchun qayta ochilmoqda", required: true },
    });
    if (ok) change(chain[0].key, note, "Muammo qayta ochildi");
  }

  if (chain.length === 0) return null;
  const idx = Math.max(0, chain.findIndex((s) => s.key === status));
  const isTerminal = idx === chain.length - 1;
  const next = !isTerminal ? chain[idx + 1] : null;
  const prev = idx > 0 ? chain[idx - 1] : null;
  const terminal = chain[chain.length - 1];
  // Yakunga bevosita "→" bilan o'tilmaydi — pastdagi izohli "Hal qilindi"dan.
  const showNext = !!next && next.key !== terminal.key;

  if (isTerminal) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onReopen}>
        Qayta ochish
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showNext && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => change(next!.key, "", `"${next!.label}" bosqichiga o'tkazildi`)}
        >
          {next!.label} →
        </Button>
      )}
      {prev && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => change(prev.key, "", `"${prev.label}" bosqichiga qaytarildi`)}
        >
          ← {prev.label}
        </Button>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          placeholder="Yechim izohi (majburiy)"
          className="h-8 w-48 text-xs"
        />
        <Button
          type="button"
          size="sm"
          disabled={pending || !resolutionNote.trim()}
          onClick={() => change(terminal.key, resolutionNote, "Muammo hal qilindi")}
        >
          Hal qilindi
        </Button>
      </div>
    </div>
  );
}

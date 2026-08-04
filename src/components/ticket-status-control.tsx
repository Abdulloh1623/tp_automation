"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTicketStatus } from "@/actions/tickets";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TicketStatusControl({
  ticketId,
  status,
}: {
  ticketId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolutionNote, setResolutionNote] = useState("");

  // Har qanday holat o'zgarishida natijaga ko'ra 2 soniyalik toast chiqadi.
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

  // Qayta ochish — bo'lim o'tishi (Hal qilingan → Yangi/Biriktirilgan), izoh MAJBURIY.
  async function onReopen() {
    const { ok, note } = await confirmWithNote({
      title: "Muammoni qayta ochish",
      confirmLabel: "Qayta ochish",
      note: { label: "Nima uchun qayta ochilmoqda", required: true },
    });
    if (ok) change("OPEN", note, "Muammo qayta ochildi");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "OPEN" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => change("IN_PROGRESS", "", "Jarayonga olindi")}
        >
          Jarayonga olish
        </Button>
      )}

      {status !== "RESOLVED" ? (
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
            onClick={() => change("RESOLVED", resolutionNote, "Muammo hal qilindi")}
          >
            Hal qilindi
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onReopen}>
          Qayta ochish
        </Button>
      )}
    </div>
  );
}

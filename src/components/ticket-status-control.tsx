"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTicketStatus } from "@/actions/tickets";
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
  function change(next: string, okMsg: string) {
    start(async () => {
      const fd = new FormData();
      if (resolutionNote) fd.set("resolutionNote", resolutionNote);
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "OPEN" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => change("IN_PROGRESS", "Jarayonga olindi")}
        >
          Jarayonga olish
        </Button>
      )}

      {status !== "RESOLVED" ? (
        <div className="flex items-center gap-2">
          <Input
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            placeholder="Yechim izohi (ixtiyoriy)"
            className="h-8 w-48 text-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => change("RESOLVED", "Muammo hal qilindi")}
          >
            Hal qilindi
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => change("OPEN", "Muammo qayta ochildi")}
        >
          Qayta ochish
        </Button>
      )}
    </div>
  );
}

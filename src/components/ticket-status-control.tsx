"use client";

import { setTicketStatus } from "@/actions/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TicketStatusControl({
  ticketId,
  status,
}: {
  ticketId: string;
  status: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "OPEN" && (
        <form action={setTicketStatus.bind(null, ticketId, "IN_PROGRESS")}>
          <Button type="submit" variant="outline" size="sm">
            Jarayonga olish
          </Button>
        </form>
      )}

      {status !== "RESOLVED" ? (
        <form
          action={setTicketStatus.bind(null, ticketId, "RESOLVED")}
          className="flex items-center gap-2"
        >
          <Input
            name="resolutionNote"
            placeholder="Yechim izohi (ixtiyoriy)"
            className="h-8 w-48 text-xs"
          />
          <Button type="submit" size="sm">
            Hal qilindi
          </Button>
        </form>
      ) : (
        <form action={setTicketStatus.bind(null, ticketId, "OPEN")}>
          <Button type="submit" variant="ghost" size="sm">
            Qayta ochish
          </Button>
        </form>
      )}
    </div>
  );
}

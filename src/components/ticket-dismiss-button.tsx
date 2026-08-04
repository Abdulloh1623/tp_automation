"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { dismissTicket } from "@/actions/tickets";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";

/** "Xato ochilgan" — muammoni bir bosishda rad etib yopadi (boshliq/admin). */
export function TicketDismissButton({
  ticketId,
  title,
}: {
  ticketId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onClick() {
    const { ok, note } = await confirmWithNote({
      title: "Muammoni rad etish",
      message: `"${title}" xato ochilgan deb yopilsinmi? Muammo "Hal qilingan"ga o'tadi.`,
      confirmLabel: "Xato ochilgan",
      note: { label: "Nima uchun xato", required: true },
    });
    if (!ok) return;
    start(async () => {
      const res = await dismissTicket(ticketId, note);
      if (res.ok) {
        toast("Muammo rad etildi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
      disabled={pending}
      onClick={onClick}
    >
      <XCircle className="h-3.5 w-3.5" /> Xato ochilgan
    </Button>
  );
}

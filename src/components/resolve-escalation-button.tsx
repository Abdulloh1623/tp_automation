"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { resolveEscalation } from "@/actions/usta";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";

/** Eskalatsiyani to'g'ridan-to'g'ri "Hal bo'ldi" deb yopadi (mas'ul xodim/boshliq). */
export function ResolveEscalationButton({
  clientId,
  label,
}: {
  clientId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onClick() {
    const { ok, note } = await confirmWithNote({
      title: "Eskalatsiyani yopish",
      message: `"${label}" hal bo'ldi deb belgilansinmi? Navbatdan chiqib yakunlangan bo'limiga o'tadi.`,
      confirmLabel: "Hal bo'ldi",
      variant: "primary",
      // Izoh MAJBURIY — mijoz tarixidagi qo'ng'iroq izohiga tushadi.
      note: {
        label: "Qanday hal qilindi",
        placeholder: "Masalan: telefon orqali sozlab berildi",
        required: true,
      },
    });
    if (!ok) return;
    start(async () => {
      const res = await resolveEscalation(clientId, note);
      if (res.ok) {
        toast("Eskalatsiya hal bo'ldi", "success");
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
      className="border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
      disabled={pending}
      onClick={onClick}
    >
      <CheckCircle2 className="h-3.5 w-3.5" /> Hal bo'ldi
    </Button>
  );
}

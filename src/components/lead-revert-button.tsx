"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { revertLead } from "@/actions/leads";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";

/** Noto'g'ri eskalatsiya/muammo qilingan lidni kunlik ishga qaytaradi (boshliq). */
export function LeadRevertButton({
  clientId,
  label,
}: {
  clientId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onClick() {
    const ok = await confirmDialog({
      title: "Lidni orqaga qaytarish",
      message: `"${label}" kunlik ishga qaytarilsinmi? Eskalatsiya/usta biriktiruvi bekor qilinadi.`,
      confirmLabel: "Qaytarish",
    });
    if (!ok) return;
    start(async () => {
      const res = await revertLead(clientId);
      if (res.ok) {
        toast("Lid kunlik ishga qaytarildi", "success");
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
      className="border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
      disabled={pending}
      onClick={onClick}
    >
      <Undo2 className="h-3.5 w-3.5" /> Orqaga qaytar
    </Button>
  );
}

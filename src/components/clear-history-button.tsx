"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { clearInventoryHistory } from "@/actions/inventory";
import { toast } from "@/components/toaster";
import { confirmDialog } from "@/components/confirm-dialog";

/**
 * Ombor HARAKATLAR TARIXINI tozalash (faqat admin). Joriy qoldiqlar saqlanadi —
 * faqat jurnal o'chiriladi. Ikki bosqichli tasdiq (confirmDialog).
 */
export function ClearHistoryButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    void (async () => {
      const ok = await confirmDialog({
        title: "Ombor tarixi tozalansinmi?",
        message:
          "Barcha harakatlar jurnali o'chiriladi. Joriy qoldiqlar (ombor/usta zaxirasi) saqlanadi. Bu amalni qaytarib bo'lmaydi.",
        confirmLabel: "Ha, tozalash",
      });
      if (!ok) return;
      start(async () => {
        const res = await clearInventoryHistory();
        if (res.ok) {
          toast("Ombor tarixi tozalandi", "success");
          router.refresh();
        } else {
          toast(res.error || "Xatolik", "error");
        }
      });
    })();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-300 dark:border-red-900 bg-white dark:bg-slate-900 px-3 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Tarixni tozalash
    </button>
  );
}

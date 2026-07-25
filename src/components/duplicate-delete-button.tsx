"use client";

// Dublikatlar sahifasida keraksiz (takroriy) nusxani o'chirish tugmasi.
// Tasdiq so'raydi (ataylab), so'ng joyida o'chiradi va ro'yxatni yangilaydi.
// Faqat ADMIN/MANAGER ko'radi (sahifa `canDelete` bilan uzatadi).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteClientInline } from "@/actions/clients";
import { toast } from "@/components/toaster";
import { confirmDialog } from "@/components/confirm-dialog";

export function DuplicateDeleteButton({
  clientId,
  name,
}: {
  clientId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onClick() {
    const ok = await confirmDialog({
      title: "Dublikat nusxani o'chirish",
      message: `"${name}" yozuvi butunlay o'chiriladi (uning to'lovlari, qo'ng'iroqlari va boshqa ma'lumotlari bilan). Bu amalni qaytarib bo'lmaydi — asl nusxa emasligiga ishonch hosil qiling.`,
      confirmLabel: "O'chirish",
      variant: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteClientInline(clientId);
      if (res.ok) {
        toast("Dublikat nusxa o'chirildi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      <Trash2 className="h-3 w-3" />
      {pending ? "..." : "O'chirish"}
    </button>
  );
}

"use client";

// Dublikatlar sahifasida bitta juftlikni "bular dublikat emas" deb
// belgilash tugmasi. Halokatli emas (hech narsa o'chmaydi, faqat keyingi
// avtomatik aniqlashdan chiqarib tashlaydi) — shuning uchun tasdiq
// so'ramaydi, faqat toast bilan natija ko'rsatadi.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { dismissDuplicatePair } from "@/actions/duplicates";
import { toast } from "@/components/toaster";

export function DismissDuplicateButton({
  clientAId,
  clientBId,
}: {
  clientAId: string;
  clientBId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const res = await dismissDuplicatePair(clientAId, clientBId);
      if (res.ok) {
        toast("Bular dublikat emas deb belgilandi", "success");
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
      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <UserX className="h-3 w-3" />
      {pending ? "..." : "Dublikat emas"}
    </button>
  );
}

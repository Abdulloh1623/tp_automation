"use client";

// Navbat kuni (yakshanba) — "Bugun ishdaman".
//
// Dushanba–shanba jadval qat'iy va lidlar cron bo'yicha o'zi bo'linadi.
// Yakshanbada jamoa navbatni o'zaro kelishadi, shuning uchun avtomatik taqsimot
// ishlamaydi: kim ishga chiqqan bo'lsa shu tugmani bosadi va kunlik ro'yxat
// faqat chiqqanlar orasida bo'linadi.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { checkInDuty } from "@/actions/distribution";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function DutyCheckIn({ checkedIn, onDuty }: { checkedIn: boolean; onDuty: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const res = await checkInDuty();
      if (res.ok) {
        toast(
          res.assigned
            ? `Ishga chiqdingiz — ${res.assigned} ta lid taqsimlandi`
            : "Ishga chiqdingiz",
          "success",
        );
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <Card className="border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900/60 dark:bg-primary-950/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {checkedIn ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
          )}
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {checkedIn ? "Bugun ishdasiz" : "Bugun yakshanba — navbat kelishuv bo'yicha"}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {checkedIn
                ? onDuty.length > 1
                  ? `Bugun ishda: ${onDuty.join(", ")} — ro'yxat o'rtada bo'lingan.`
                  : "Kunlik ro'yxat to'liq sizga berildi. Yana kimdir chiqsa, qolgani qayta bo'linadi."
                : "Ro'yxat oldindan biriktirilmagan. Ishga chiqqan bo'lsangiz belgilang — kunlik lidlar sizga (va bugun chiqqan boshqalarga) bo'linadi."}
            </p>
          </div>
        </div>
        {!checkedIn && (
          <Button disabled={pending} onClick={onClick}>
            <CalendarCheck className="h-4 w-4" /> Bugun ishdaman
          </Button>
        )}
      </div>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Wrench } from "lucide-react";
import { deactivateRefusedClients } from "@/actions/clients";
import { ClientLink } from "@/components/client-link";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, formatPhone } from "@/lib/utils";

export type RefusedActiveRow = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  monthlyAmount: number;
  currency: string;
};

/**
 * "Otkaz qilingan, lekin hali Faol" mijozlar + bir amalda tuzatish.
 *
 * Bu blok NOL bo'lishi kerak: ilovaning o'z otkaz yo'llari `status` ni ham
 * qo'yadi, bunday yozuvlar faqat eski importlardan qoladi.
 */
export function RefusedActiveFix({
  rows,
  mrr,
}: {
  rows: RefusedActiveRow[];
  /** Valyuta -> oylik summa; tuzatilgach MRR shuncha kamayadi. */
  mrr: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) return null;

  const mrrText = Object.entries(mrr)
    .filter(([, v]) => v > 0)
    .map(([cur, v]) => formatMoney(v, cur))
    .join(" + ");

  async function fix() {
    const ok = await confirmDialog({
      title: `${rows.length} ta mijoz nofaol qilinsinmi?`,
      message:
        `Ular allaqachon otkazda, lekin holati "Faol" bo'lib turibdi. ` +
        `Tuzatilgach MRR ${mrrText} ga kamayadi — bu to'g'ri natija: ` +
        `otkaz mijozning oyligi daromadga kirmasligi kerak. ` +
        `Churn sanasi (moliya hisobi uchun) yoziladi.`,
      confirmLabel: "Ha, tuzatish",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deactivateRefusedClients();
      if (res.ok) {
        toast(`${res.fixed ?? 0} ta mijoz nofaol qilindi`, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-[260px] flex-1">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
              Otkaz qilingan, lekin hali &laquo;Faol&raquo; &mdash; {rows.length} ta mijoz
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ular <b>/otkaz</b> bo&apos;limida, lekin holati o&apos;zgartirilmagan &mdash;
              shu sabab oyligi <b>MRR ga qo&apos;shilib turibdi</b> ({mrrText}) va uskuna
              hisoblarida ham sanaladi. Ayni paytda <b>/mijozlar</b> ro&apos;yxatida
              ko&apos;rinmaydi, ya&apos;ni bir xil narsani sanaydigan ikki joy har xil son
              beradi. Eski importlardan qolgan &mdash; ilovaning o&apos;z otkaz tugmasi
              holatni to&apos;g&apos;ri qo&apos;yadi.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Yashirish" : "Ro'yxat"}
            </Button>
            <Button size="sm" onClick={fix} disabled={pending}>
              <Wrench className="h-4 w-4" />
              {pending ? "..." : "Tuzatish"}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Mijoz</th>
                  <th className="px-3 py-2 font-medium">Telefon</th>
                  <th className="px-3 py-2 text-right font-medium">Oylik</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="px-3 py-1.5">
                      <ClientLink id={c.id} name={c.restaurantName || c.fullName || "—"} />
                    </td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                      {c.phone ? formatPhone(c.phone) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {c.monthlyAmount > 0 ? formatMoney(c.monthlyAmount, c.currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

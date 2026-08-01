"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eraser } from "lucide-react";
import { clearInactiveClientEquipment } from "@/actions/equipment";
import { ClientLink } from "@/components/client-link";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CLIENT_STATUS } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";

export type StaleRow = {
  id: string;
  name: string;
  status: string;
  rental: number;
  sold: number;
};

const statusLabel = (s: string) => CLIENT_STATUS[s as keyof typeof CLIENT_STATUS] ?? s;

/**
 * Nofaol mijozlarda qolib ketgan uskuna yozuvlari + tozalash tugmasi.
 *
 * Bu blok NOL bo'lishi kerak: noldan katta bo'lsa, uskuna qaytarib olingan-u
 * yozuvi o'chirilmagan (qaytarish tizimdan tashqarida bo'lgan).
 */
export function StaleEquipmentCleanup({
  rows,
  units,
  rentalUsd,
}: {
  rows: StaleRow[];
  units: number;
  rentalUsd: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  if (units === 0) return null;

  async function clean() {
    const ok = await confirmDialog({
      title: "Yozuvlar o'chirilsinmi?",
      message:
        `${units} dona uskuna yozuvi ${rows.length} ta nofaol mijozdan o'chiriladi. ` +
        "Ombor qoldig'iga tegilmaydi — uskuna jismonan qaytgan bo'lsa, omborga " +
        "alohida kirim qiling. O'chirilganlar audit jurnalida qoladi.",
      confirmLabel: "O'chirish",
      variant: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await clearInactiveClientEquipment();
      if (res.ok) {
        toast(`${res.removed} dona yozuv tozalandi`, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <Card className="border-amber-200 dark:border-amber-900">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-[240px] flex-1">
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Nofaol mijozlarda qolgan yozuv — {units} dona
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {rows.length} ta o&apos;chirilgan/kutilayotgan mijozda uskuna yozuvi turibdi.
              Yuqoridagi jamilarga <b>kirmaydi</b>. Uskuna qaytarib olingan bo&apos;lsa,
              yozuvni tozalang — aks holda mijoz kartasida ham noto&apos;g&apos;ri
              ko&apos;rinib turadi.
              {rentalUsd > 0 && (
                <> Ijara narxida bu {formatMoney(rentalUsd, "USD")}/oy soxta daromad.</>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Yashirish" : "Ro'yxat"}
            </Button>
            <Button size="sm" onClick={clean} disabled={pending}>
              <Eraser className="h-4 w-4" />
              {pending ? "..." : "Tozalash"}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Mijoz</th>
                  <th className="px-3 py-2 font-medium">Holat</th>
                  <th className="px-3 py-2 text-right font-medium">Ijara</th>
                  <th className="px-3 py-2 text-right font-medium">Sotuv</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="px-3 py-1.5">
                      <ClientLink id={r.id} name={r.name || "—"} />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-slate-400">
                      {statusLabel(r.status)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.rental || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {r.sold || "—"}
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

"use client";

import { useMemo, useState } from "react";
import { Search, Phone, Wrench, Tag, HardHat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PhoneCopyButton } from "@/components/phone-copy";
import { formatMoney, formatPhone, normalizePhone } from "@/lib/utils";

export type UstaInfo = {
  id: string;
  name: string;
  phone: string | null;
  regions: string[];
  items: { name: string; quantity: number }[];
};

export type PriceInfo = {
  id: string;
  name: string;
  salePrice: number;
  rentalPrice: number;
  warehouseQty: number;
};

export function ReferenceBoard({
  ustalar,
  prices,
}: {
  ustalar: UstaInfo[];
  prices: PriceInfo[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const ustalarShown = useMemo(() => {
    if (!q) return ustalar;
    return ustalar.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.phone ?? "").includes(q) ||
        u.regions.some((r) => r.toLowerCase().includes(q)),
    );
  }, [ustalar, q]);

  const pricesShown = useMemo(() => {
    if (!q) return prices;
    return prices.filter((p) => p.name.toLowerCase().includes(q));
  }, [prices, q]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Usta ismi, viloyat yoki uskuna nomi bo'yicha qidirish..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-primary-900/40"
        />
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <HardHat className="h-4 w-4" /> Ustalar
          <span className="font-normal text-slate-400 dark:text-slate-500">({ustalarShown.length})</span>
        </h2>
        {ustalarShown.length === 0 ? (
          <EmptyState icon={HardHat} title="Usta topilmadi" hint="Qidiruvga mos usta yo'q." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ustalarShown.map((u) => (
              <Card key={u.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div>
                </div>
                {u.phone && (
                  <div className="mt-1 flex items-center gap-1 text-sm">
                    <a
                      href={`tel:${normalizePhone(u.phone)}`}
                      className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {formatPhone(u.phone)}
                    </a>
                    <PhoneCopyButton phone={u.phone} />
                  </div>
                )}
                {u.regions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {u.regions.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  {u.items.length === 0 ? (
                    <span>Hozircha uskuna yo'q</span>
                  ) : (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {u.items.map((it) => (
                        <span key={it.name}>
                          {it.name}: <span className="font-medium text-slate-700 dark:text-slate-200">{it.quantity}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Tag className="h-4 w-4" /> Narxlar
          <span className="font-normal text-slate-400 dark:text-slate-500">({pricesShown.length})</span>
        </h2>
        {pricesShown.length === 0 ? (
          <EmptyState icon={Wrench} title="Uskuna turi topilmadi" hint="Qidiruvga mos uskuna turi yo'q." />
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                      <th className="px-4 py-3 font-medium">Uskuna</th>
                      <th className="px-4 py-3 font-medium">Sotuv narxi</th>
                      <th className="px-4 py-3 font-medium">Ijara narxi (oyiga)</th>
                      <th className="px-4 py-3 text-center font-medium">Omborda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricesShown.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                          {p.name}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                          {formatMoney(p.salePrice, "USD")}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                          {formatMoney(p.rentalPrice, "USD")}
                        </td>
                        <td className="px-4 py-2.5 text-center font-medium text-slate-700 dark:text-slate-200">
                          {p.warehouseQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

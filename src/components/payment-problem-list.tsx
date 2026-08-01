"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Pencil } from "lucide-react";
import { ClientLink } from "@/components/client-link";
import { PhoneCopyButton } from "@/components/phone-copy";
import { SearchInput, FoundCount, matchesQuery } from "@/components/list-filter";
import { Card } from "@/components/ui/card";
import type { PaymentRuleClient } from "@/lib/problem-clients";
import { formatMoney, formatPhone } from "@/lib/utils";

export type ProblemBucket = {
  key: string;
  title: string;
  hint: string;
  tone: "red" | "amber" | "slate";
  items: PaymentRuleClient[];
  /**
   * Oylik summadan kelib chiqib mijozda BO'LISHI kerak bo'lgan ijara qiymati
   * ($/oy) ko'rsatilsinmi. Faqat "ortiq to'laydi, uskunasi yo'q" ro'yxatida
   * ma'noli — boshqasida chalg'itadi.
   */
  showExpected?: boolean;
};

const TONE: Record<ProblemBucket["tone"], { border: string; head: string; chip: string }> = {
  red: {
    border: "border-red-200 dark:border-red-900",
    head: "text-red-700 dark:text-red-400",
    chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
  amber: {
    border: "border-amber-200 dark:border-amber-900",
    head: "text-amber-700 dark:text-amber-400",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  slate: {
    border: "border-slate-200 dark:border-slate-800",
    head: "text-slate-700 dark:text-slate-300",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
};

function Bucket({
  bucket,
  query,
  baseUsd,
}: {
  bucket: ProblemBucket;
  query: string;
  baseUsd: number;
}) {
  const t = TONE[bucket.tone];
  const items = useMemo(
    () =>
      bucket.items.filter((c) =>
        matchesQuery(query, `${c.restaurantName} ${c.fullName}`, c.phone),
      ),
    [bucket.items, query],
  );

  // Qidiruv bo'yicha bu ro'yxatda hech narsa qolmasa — kartani umuman
  // ko'rsatmaymiz (bo'sh kartalar ekranni to'ldirib, natijani yashiradi).
  if (bucket.items.length > 0 && items.length === 0) return null;

  return (
    <Card className={t.border}>
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={"text-sm font-semibold " + t.head}>{bucket.title}</h3>
          <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + t.chip}>
            {items.length}
            {items.length !== bucket.items.length && ` / ${bucket.items.length}`}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{bucket.hint}</p>
      </div>

      {bucket.items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-emerald-600 dark:text-emerald-400">
          Nomuvofiqlik topilmadi.
        </p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            {/* Sarlavha yopishqoq — foni TO'LIQ shaffofmas bo'lishi shart,
                aks holda ostidan sirg'alib o'tayotgan qator ko'rinib turadi. */}
            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Mijoz</th>
                <th className="px-3 py-2 font-medium">Telefon</th>
                <th className="px-3 py-2 text-right font-medium">Oylik</th>
                <th className="px-3 py-2 text-right font-medium">Uskuna</th>
                {bucket.showExpected && (
                  <th className="px-3 py-2 text-right font-medium">Kutilayotgan ijara</th>
                )}
                <th className="px-3 py-2 font-medium">Operator</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-4 py-2">
                    <ClientLink id={c.id} name={c.restaurantName || c.fullName || "—"} />
                    {c.fullName && c.restaurantName && (
                      <div className="text-xs text-slate-400">{c.fullName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {formatPhone(c.phone)}
                        <PhoneCopyButton phone={c.phone} />
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">
                    {c.monthlyAmount > 0 ? formatMoney(c.monthlyAmount, c.currency) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {c.rentedQty > 0 ? `${c.rentedQty} ijara` : "—"}
                    {c.soldQty > 0 && (
                      <div className="text-xs text-slate-400">{c.soldQty} sotuv</div>
                    )}
                  </td>
                  {bucket.showExpected && (
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
                      ${Math.round((c.monthlyAmount - baseUsd) * 100) / 100}
                    </td>
                  )}
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {c.assignedToName ?? "biriktirilmagan"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/mijozlar/${c.id}/tahrir`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-3 w-3" />
                      Tahrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * To'lov/ijara nomuvofiqligi ro'yxatlari — bitta qidiruv barcha bloklarga
 * birdaniga qo'llanadi (mijozning QAYSI blokda ekanini bilmasdan qidirish
 * mumkin bo'lsin).
 */
export function PaymentProblemList({
  buckets,
  baseUsd,
}: {
  buckets: ProblemBucket[];
  baseUsd: number;
}) {
  const [query, setQuery] = useState("");
  const total = buckets.reduce((n, b) => n + b.items.length, 0);
  const found = buckets.reduce(
    (n, b) =>
      n +
      b.items.filter((c) => matchesQuery(query, `${c.restaurantName} ${c.fullName}`, c.phone))
        .length,
    0,
  );

  if (total === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          To&apos;lov va ijara ma&apos;lumotlari mos — nomuvofiqlik yo&apos;q.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <FoundCount found={found} total={total} />
      </div>
      {buckets.map((b) => (
        <Bucket key={b.key} bucket={b} query={query} baseUsd={baseUsd} />
      ))}
    </div>
  );
}

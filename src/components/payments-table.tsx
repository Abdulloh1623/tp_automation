"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, X } from "lucide-react";
import type { PaymentState } from "@/lib/payment-status";

export type PaymentRow = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  state: PaymentState;
  stateLabel: string;
  nextPaymentFmt: string;
  qoldi: string;
  overdue: boolean;
  monthlyFmt: string;
  operatorName: string;
};

const STATE_TONE: Record<PaymentState, string> = {
  OVERDUE: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  DUE_TODAY: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  DUE_SOON: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  OK: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  NONE: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

type Filter = "ALL" | PaymentState;

/** Qidiruv uchun normalizatsiya (apostrof/registr/bo'sh joy). */
function norm(s: string): string {
  return s.toLowerCase().replace(/['`‘’ʻ]/g, "").replace(/\s+/g, " ").trim();
}
/** Faqat raqamlar (telefon bo'yicha qidiruv uchun). */
function digits(s: string): string {
  return s.replace(/\D/g, "");
}

export function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    for (const r of rows) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = norm(query);
    const qDigits = digits(query);
    return rows.filter((r) => {
      if (filter !== "ALL" && r.state !== filter) return false;
      if (!q) return true;
      const hay = norm(r.restaurantName + " " + r.fullName);
      const phoneMatch = qDigits.length >= 3 && digits(r.phone).includes(qDigits);
      return hay.includes(q) || phoneMatch;
    });
  }, [rows, query, filter]);

  const chips: { key: Filter; label: string }[] = [
    { key: "ALL", label: "Hammasi" },
    { key: "OVERDUE", label: "Muddati o'tgan" },
    { key: "DUE_TODAY", label: "Bugun" },
    { key: "DUE_SOON", label: "Yaqin" },
    { key: "OK", label: "Joyida" },
    { key: "NONE", label: "Sanasiz" },
  ];

  return (
    <div className="space-y-3">
      {/* Qidiruv + filtr */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Restoran, ism yoki telefon bo'yicha qidiring..."
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Topildi: <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length}</span>
          {filtered.length !== rows.length && <> / {rows.length}</>}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((ch) => {
          const active = filter === ch.key;
          const n = ch.key === "ALL" ? counts.ALL : (counts[ch.key] ?? 0);
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => setFilter(ch.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")
              }
            >
              {ch.label} <span className={active ? "text-blue-100" : "text-slate-400"}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Jadval */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3 font-medium">Mijoz</th>
              <th className="px-4 py-3 font-medium">Holat</th>
              <th className="px-4 py-3 font-medium">Keyingi to'lov</th>
              <th className="px-4 py-3 font-medium">Qoldi</th>
              <th className="px-4 py-3 font-medium">Oylik</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                  Mijoz topilmadi
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{r.restaurantName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {r.fullName}
                    {r.phone && <span className="ml-2 tabular-nums">{r.phone}</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={"inline-block rounded-full px-2 py-0.5 text-xs font-medium " + STATE_TONE[r.state]}>
                    {r.stateLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.nextPaymentFmt}</td>
                <td className={"px-4 py-3 " + (r.overdue ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300")}>
                  {r.qoldi}
                </td>
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{r.monthlyFmt}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.operatorName}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/mijozlar/${r.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
                  >
                    To'lov
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

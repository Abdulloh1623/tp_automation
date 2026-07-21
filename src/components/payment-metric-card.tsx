"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatPhone } from "@/lib/utils";
import { PhoneCopyButton } from "@/components/phone-copy";

/**
 * To'lovlar sahifasidagi metrik kartaning bir qatori — modal ichida
 * ko'rsatiladi. Sahifa (server komponent) tayyor formatlangan matn beradi,
 * shuning uchun bu yerda hech qanday sana/valyuta hisobi yo'q.
 */
export type MetricDetailRow = {
  /** Mijoz id — kartochkadan mijoz sahifasiga o'tish uchun */
  clientId: string;
  restaurantName: string;
  fullName: string;
  phone: string | null;
  /** Summa (formatlangan) */
  amountFmt: string;
  /** Sana (formatlangan) */
  dateFmt: string;
  /** Sana ostidagi qo'shimcha izoh: "3 kun o'tdi", to'lov usuli va h.k. */
  hint: string | null;
  operatorName: string | null;
};

type Tone = "red" | "amber" | "emerald";

const TONE_ICON: Record<Tone, string> = {
  red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
};
const TONE_TITLE: Record<Tone, string> = {
  red: "text-red-700 dark:text-red-300",
  amber: "text-amber-700 dark:text-amber-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
};

/** Qidiruv uchun normalizatsiya (apostrof/registr/bo'sh joy). */
function norm(s: string): string {
  return s.toLowerCase().replace(/['`‘’ʻ]/g, "").replace(/\s+/g, " ").trim();
}
function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Bosiladigan metrik karta: ustiga bosilsa — shu ko'rsatkichga kirgan
 * mijozlar ro'yxati (ism, telefon, summa, sana) modal oynada chiqadi.
 */
export function PaymentMetricCard({
  label,
  value,
  icon: Icon,
  tone,
  rows,
  amountHeader,
  dateHeader,
  emptyText,
  totalFmt,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  rows: MetricDetailRow[];
  /** Jadval sarlavhasi: "Oylik" / "To'langan summa" */
  amountHeader: string;
  /** Jadval sarlavhasi: "To'lov sanasi" / "To'langan sana" */
  dateHeader: string;
  emptyText: string;
  /** Modal pastidagi jami (allaqachon formatlangan) */
  totalFmt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Escape bilan yopish — modal ochiq bo'lgandagina tinglaymiz
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const filtered = useMemo(() => {
    const q = norm(query);
    const qDigits = digits(query);
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = norm(r.restaurantName + " " + r.fullName);
      const phoneMatch = qDigits.length >= 3 && digits(r.phone ?? "").includes(qDigits);
      return hay.includes(q) || phoneMatch;
    });
  }, [rows, query]);

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="cursor-pointer p-5 transition hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-200 dark:hover:border-slate-700 dark:focus:ring-primary-900/40"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${TONE_ICON[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
            <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Batafsil ko&apos;rish uchun bosing
        </div>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="my-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className={"flex items-center gap-2 text-base font-semibold " + TONE_TITLE[tone]}>
                  <Icon className="h-4 w-4 shrink-0" /> {label}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{value}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Yopish"
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {rows.length > 8 && (
              <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Restoran, ism yoki telefon bo'yicha qidiring..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
                  />
                </div>
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {rows.length === 0 ? emptyText : "Qidiruv bo'yicha hech narsa topilmadi"}
                </p>
              ) : (
                <>
                  {/* Desktop — jadval */}
                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="py-2 font-medium">Mijoz</th>
                        <th className="py-2 font-medium">{amountHeader}</th>
                        <th className="py-2 font-medium">{dateHeader}</th>
                        <th className="py-2 font-medium">Operator</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr
                          key={r.clientId + i}
                          className="border-t border-slate-100 dark:border-slate-800"
                        >
                          <td className="py-2.5 pr-3">
                            <div className="font-medium text-slate-800 dark:text-slate-100">
                              {r.restaurantName || r.fullName || "—"}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                              <span>{r.fullName}</span>
                              {r.phone && (
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  {formatPhone(r.phone)}
                                  <PhoneCopyButton phone={r.phone} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 font-medium text-slate-700 dark:text-slate-200">
                            {r.amountFmt}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                            {r.dateFmt}
                            {r.hint && (
                              <div className="text-xs text-slate-400 dark:text-slate-500">{r.hint}</div>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                            {r.operatorName ?? "—"}
                          </td>
                          <td className="py-2.5 text-right">
                            <Link
                              href={`/mijozlar/${r.clientId}`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                            >
                              Ochish
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Mobil — kartalar */}
                  <div className="space-y-2 md:hidden">
                    {filtered.map((r, i) => (
                      <div
                        key={r.clientId + i}
                        className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                      >
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {r.restaurantName || r.fullName || "—"}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>{r.fullName}</span>
                          {r.phone && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              {formatPhone(r.phone)}
                              <PhoneCopyButton phone={r.phone} />
                            </span>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">{amountHeader}: </span>
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {r.amountFmt}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">{dateHeader}: </span>
                            <span className="text-slate-700 dark:text-slate-200">{r.dateFmt}</span>
                          </div>
                          {r.hint && (
                            <div className="text-slate-500 dark:text-slate-400">{r.hint}</div>
                          )}
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">Operator: </span>
                            <span className="text-slate-700 dark:text-slate-200">
                              {r.operatorName ?? "—"}
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/mijozlar/${r.clientId}`}
                          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                        >
                          Ochish
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">
                {filtered.length} ta
                {filtered.length !== rows.length && <> / {rows.length}</>}
              </span>
              {totalFmt && (
                <span className="text-slate-500 dark:text-slate-400">
                  Jami:{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{totalFmt}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

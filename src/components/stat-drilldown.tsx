"use client";

// Daromad plitkasi — ustiga bosilsa qaysi mijoz qancha (oylik hissa / to'lagan /
// qarzi) ekanini ro'yxat (modal) bilan ochadi. Mijoz nomiga bosilsa to'liq
// profil ochiladi. Qidiruv bilan uzun ro'yxatni filtrlash mumkin.

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Search } from "lucide-react";

export type DrilldownItem = { id: string; name: string; amount: string; sub?: string };

type Tone = "slate" | "emerald" | "red";

const tileTone: Record<Tone, string> = {
  slate: "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60",
  emerald: "border-emerald-100 bg-emerald-50 dark:border-emerald-950 dark:bg-emerald-950/40",
  red: "border-red-100 bg-red-50 dark:border-red-950 dark:bg-red-950/40",
};
const valueTone: Record<Tone, string> = {
  slate: "text-slate-900 dark:text-slate-100",
  emerald: "text-emerald-700 dark:text-emerald-300",
  red: "text-red-700 dark:text-red-300",
};
const labelTone: Record<Tone, string> = {
  slate: "text-slate-500 dark:text-slate-400",
  emerald: "text-emerald-700 dark:text-emerald-300",
  red: "text-red-700 dark:text-red-300",
};

export function StatDrilldown({
  label,
  value,
  tone,
  title,
  items,
  emptyText = "Ma'lumot yo'q",
}: {
  label: string;
  value: string;
  tone: Tone;
  title: string;
  items: DrilldownItem[];
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? items.filter((i) => i.name.toLowerCase().includes(needle))
    : items;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group rounded-xl border p-4 text-left transition-shadow hover:shadow-md ${tileTone[tone]}`}
      >
        <div className={`flex items-center justify-between text-xs ${labelTone[tone]}`}>
          <span>{label}</span>
          <span className="opacity-0 transition-opacity group-hover:opacity-100">ko&apos;rish →</span>
        </div>
        <div className={`mt-1 text-xl font-semibold ${valueTone[tone]}`}>{value}</div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="mt-[6vh] w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Yopish"
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-3">
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Mijoz qidirish..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-primary-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  {needle ? "Topilmadi" : emptyText}
                </p>
              ) : (
                <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {filtered.map((i) => (
                    <li key={i.id}>
                      <Link
                        href={`/mijozlar/${i.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {i.name}
                          </span>
                          {i.sub && (
                            <span className="block text-xs text-slate-400 dark:text-slate-500">{i.sub}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {i.amount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-2 pb-1 pt-2 text-xs text-slate-400 dark:text-slate-500">
                {filtered.length} ta mijoz
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

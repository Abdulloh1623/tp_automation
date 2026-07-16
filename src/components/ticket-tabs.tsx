"use client";

import { useState, type ReactNode } from "react";

export type TicketTab = {
  key: string;
  label: string;
  icon: ReactNode;
  tone: "amber" | "sky" | "emerald";
  count: number; // qamrov bo'yicha jami (filtrdan mustaqil)
  content: ReactNode;
};

const ACTIVE_TONE: Record<TicketTab["tone"], string> = {
  amber:
    "border-amber-500 text-amber-700 bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:bg-amber-950/40",
  sky:
    "border-sky-500 text-sky-700 bg-sky-50 dark:border-sky-400 dark:text-sky-300 dark:bg-sky-950/40",
  emerald:
    "border-emerald-500 text-emerald-700 bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:bg-emerald-950/40",
};

const BADGE_TONE: Record<TicketTab["tone"], string> = {
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

/**
 * Muammolar bo'limlari — yuqorida yonma-yon tablar. Bosilganda faqat o'sha
 * bo'lim ticketlari ko'rinadi. Ma'lumot serverda tayyorlanadi (content), tab
 * almashinuvi mijoz tomonida (refetch yo'q).
 */
export function TicketTabs({
  tabs,
  initialKey,
}: {
  tabs: TicketTab[];
  initialKey: string;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.key === initialKey) ? initialKey : (tabs[0]?.key ?? ""),
  );
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900/60"
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={
                "flex flex-1 min-w-max items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
                (isActive
                  ? ACTIVE_TONE[t.tone]
                  : "border-transparent text-slate-500 hover:bg-white hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200")
              }
            >
              <span className="flex h-4 w-4 items-center justify-center">{t.icon}</span>
              {t.label}
              <span
                className={
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                  (isActive ? BADGE_TONE[t.tone] : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300")
                }
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}

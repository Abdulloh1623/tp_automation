"use client";

// "Oxirgi 7 kun — men gaplashgan lidlar" (profil sahifasi).
//
// Har bir kun alohida qator: bosilganda o'sha kunning lidlari ochiladi. Bugun
// avtomatik ochiq, qolganlari yopiq — bir haftalik ro'yxat sahifani cho'zib
// yubormasin. Guruhlash SERVER tomonda (`lib/week-calls.ts`), bu komponent
// faqat ochib/yopib turadi.

import { useState } from "react";
import { ChevronDown, PhoneCall, PhoneOff } from "lucide-react";
import { ClientLink } from "@/components/client-link";
import { PhoneCopyButton } from "@/components/phone-copy";
import { LeadStageBadge } from "@/components/status-badge";
import type { DayCallGroup } from "@/lib/week-calls";
import { cn, formatPhone, normalizePhone } from "@/lib/utils";

export function MyWeekCalls({ days }: { days: DayCallGroup[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(days.filter((d) => d.isToday).map((d) => [d.key, true])),
  );

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const isOpen = !!open[day.key];
        const empty = day.leads === 0;
        return (
          <div
            key={day.key}
            className={cn(
              "overflow-hidden rounded-xl border",
              day.isToday
                ? "border-primary-200 dark:border-primary-900"
                : "border-slate-200 dark:border-slate-800",
            )}
          >
            <button
              type="button"
              disabled={empty}
              aria-expanded={isOpen}
              onClick={() => setOpen((p) => ({ ...p, [day.key]: !p[day.key] }))}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left",
                empty ? "cursor-default" : "hover:bg-slate-50 dark:hover:bg-slate-800/60",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                    isOpen ? "" : "-rotate-90",
                    empty && "opacity-0",
                  )}
                />
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    day.isToday
                      ? "text-primary-700 dark:text-primary-300"
                      : "text-slate-700 dark:text-slate-200",
                  )}
                >
                  {day.isToday ? `Bugun · ${day.label}` : day.label}
                </span>
              </span>
              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                {empty ? (
                  "qo'ng'iroq yo'q"
                ) : (
                  <>
                    {day.leads} lid ·{" "}
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      {day.talked} gaplashildi
                    </span>
                  </>
                )}
              </span>
            </button>

            {isOpen && !empty && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {day.items.map((it) => (
                  <li key={it.clientId} className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {it.talked ? (
                          <PhoneCall className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <PhoneOff className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                        )}
                        <ClientLink id={it.clientId} name={it.name} />
                        {it.calls > 1 && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            ×{it.calls}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <a
                          href={`tel:${normalizePhone(it.phone)}`}
                          className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                        >
                          {formatPhone(it.phone)}
                        </a>
                        <PhoneCopyButton phone={it.phone} />
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-medium",
                            it.talked
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                          )}
                        >
                          {it.resultLabel}
                        </span>
                        <span title="Hozirgi bosqich">
                          <LeadStageBadge stage={it.stage} />
                        </span>
                        <span className="tabular-nums">{it.time}</span>
                      </span>
                    </div>
                    {it.note && (
                      <p className="mt-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                        {it.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

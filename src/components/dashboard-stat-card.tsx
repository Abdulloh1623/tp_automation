"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  ChevronRight,
  Users,
  PhoneCall,
  AlertTriangle,
  Banknote,
  UserPlus,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type DetailBadgeTone =
  | "neutral"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "slate";

export type DetailRow = {
  id: string;
  href?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: { text: string; tone: DetailBadgeTone };
};

export type CardDetail = {
  rows: DetailRow[];
  emptyText: string;
  footerHref?: string;
  footerText?: string;
};

const ICONS = {
  users: Users,
  phone: PhoneCall,
  alert: AlertTriangle,
  money: Banknote,
  userplus: UserPlus,
  check: CheckCircle2,
} as const;

export type StatIconName = keyof typeof ICONS;

const TONE = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
  red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
} as const;

export type StatTone = keyof typeof TONE;

export function DashboardStatCard({
  label,
  value,
  icon,
  tone,
  hint,
  detail,
}: {
  label: string;
  value: string;
  icon: StatIconName;
  tone: StatTone;
  hint?: string;
  detail: CardDetail;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[icon];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left"
      >
        <Card className="p-5 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {value}
              </div>
              {hint && <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
            </div>
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${TONE[tone]}`}
            >
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
            Batafsil
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </Card>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="Yopish"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {detail.rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                  {detail.emptyText}
                </p>
              ) : (
                detail.rows.map((r) => {
                  const body = (
                    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                          {r.title}
                        </div>
                        {r.subtitle && (
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {r.subtitle}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.badge && <Badge tone={r.badge.tone}>{r.badge.text}</Badge>}
                        {r.meta && (
                          <span className="whitespace-nowrap text-sm font-medium text-slate-600 dark:text-slate-300">
                            {r.meta}
                          </span>
                        )}
                        {r.href && (
                          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-700" />
                        )}
                      </div>
                    </div>
                  );
                  return r.href ? (
                    <Link
                      key={r.id}
                      href={r.href}
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div key={r.id}>{body}</div>
                  );
                })
              )}
            </div>

            {detail.footerHref && (
              <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                <Link
                  href={detail.footerHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {detail.footerText ?? "Hammasini ko'rish"} →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

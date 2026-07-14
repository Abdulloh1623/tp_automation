"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneCall, CheckCircle2, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { OperatorDailyStats } from "@/lib/analytics";

const POLL_MS = 30000; // 30 soniya — qisqa polling

/**
 * Feature B — operatorning kunlik progress paneli. `/api/analytics/me` dan har
 * 30 soniyada yangilanadi, shu bilan operator o'z raqamlari (urinish/gaplashish)
 * qo'lda yangilamasdan oshib borishini ko'radi.
 */
export function OperatorProgress({ initial }: { initial: OperatorDailyStats }) {
  const [data, setData] = useState<OperatorDailyStats>(initial);
  const [live, setLive] = useState(true);
  const [bump, setBump] = useState(false);
  const prev = useRef<OperatorDailyStats>(initial);
  const bumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/me", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next: OperatorDailyStats = await res.json();
      if (
        next.attempted !== prev.current.attempted ||
        next.successful !== prev.current.successful
      ) {
        setBump(true);
        if (bumpTimer.current) clearTimeout(bumpTimer.current);
        bumpTimer.current = setTimeout(() => setBump(false), 1200);
      }
      prev.current = next;
      setData(next);
      setLive(true);
    } catch {
      setLive(false); // tarmoq xatosi — oxirgi ma'lumot ko'rinib turaveradi
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(id);
      if (bumpTimer.current) clearTimeout(bumpTimer.current);
    };
  }, [refresh]);

  const target = data.target > 0 ? data.target : 0;
  const pct = target > 0 ? Math.min(100, Math.round((data.attempted / target) * 100)) : 0;
  const barColor = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-primary-500" : "bg-amber-500";

  return (
    <Card className="p-5" aria-live="polite">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Bugungi ishim
          </h2>
          <span
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] dark:border-slate-800 dark:bg-slate-900"
            title={live ? "Jonli yangilanmoqda" : "Ulanish yo'q"}
          >
            <span className="relative flex h-2 w-2">
              {live && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={
                  "relative inline-flex h-2 w-2 rounded-full " +
                  (live ? "bg-emerald-500" : "bg-slate-300")
                }
              />
            </span>
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {live ? "Jonli" : "Ulanish yo'q"}
            </span>
          </span>
        </div>
        <span
          className={
            "text-xs font-medium tabular-nums transition-colors duration-500 " +
            (bump ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500")
          }
        >
          {data.attempted}/{target || "—"} urinish
        </span>
      </div>

      {/* Progress bar — urinishlar kunlik maqsadga nisbatan */}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={data.attempted}
        aria-valuemin={0}
        aria-valuemax={target || undefined}
        aria-label={`Kunlik urinishlar: ${data.attempted}${target ? ` / ${target}` : ""}`}
      >
        <div
          className={"h-full rounded-full transition-all duration-500 " + barColor}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          icon={<PhoneCall className="h-4 w-4" />}
          tone="blue"
          value={data.attempted}
          label="Urinilgan"
        />
        <Metric
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          value={data.successful}
          label="Gaplashilgan"
        />
        <Metric
          icon={<Users className="h-4 w-4" />}
          tone="slate"
          value={data.assigned}
          label="Biriktirilgan"
        />
      </div>
    </Card>
  );
}

const toneMap: Record<string, string> = {
  blue: "bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  slate: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

function Metric({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "blue" | "emerald" | "slate";
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <span className={"flex h-8 w-8 items-center justify-center rounded-lg " + toneMap[tone]}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-none text-slate-900 tabular-nums dark:text-slate-100">
          {value}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
          {label}
        </div>
      </div>
    </div>
  );
}

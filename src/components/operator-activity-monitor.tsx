"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityFeed, OperatorActivity } from "@/lib/analytics";

const POLL_MS = 30000; // 30 soniya
const IDLE_MS = 15 * 60 * 1000; // 15 daqiqa — shundan oshsa "Bo'sh" (idle)

/**
 * Feature C — boshliq uchun operatorlar jonli faolligi. `/api/analytics/activity`
 * dan har 30 soniyada yangilanadi. Operator oxirgi 15 daqiqada hech qanday
 * yozuv qo'shmagan bo'lsa — "Bo'sh" (sariq), aks holda "Faol" (yashil).
 * Idle holati klientda (joriy vaqtga nisbatan) hisoblanadi, shuning uchun
 * pollinglar orasida ham to'g'ri ko'rinadi.
 */
export function OperatorActivityMonitor({ initial }: { initial: ActivityFeed }) {
  const [data, setData] = useState<ActivityFeed>(initial);
  const [live, setLive] = useState(true);
  // Idle hisoblash joriy vaqtga bog'liq — soatni muntazam yangilab turamiz
  const [nowMs, setNowMs] = useState<number>(() => Date.parse(initial.ts));
  const prev = useRef<ActivityFeed>(initial);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/activity", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next: ActivityFeed = await res.json();

      const changed = new Set<string>();
      const prevById = new Map(prev.current.operators.map((o) => [o.id, o]));
      for (const o of next.operators) {
        const p = prevById.get(o.id);
        if (p && o.attempted !== p.attempted) changed.add(o.id);
      }
      prev.current = next;
      setData(next);
      setNowMs(Date.parse(next.ts));
      setLive(true);
      if (changed.size) {
        setFlash(changed);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(new Set()), 1600);
      }
    } catch {
      setLive(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    // Idle chegarasi vaqt o'tishi bilan ham o'zgaradi — soatni har 30s siljitamiz
    const clock = setInterval(() => setNowMs((t) => t + POLL_MS), POLL_MS);
    return () => {
      clearInterval(id);
      clearInterval(clock);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [refresh]);

  const ops = data.operators;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Operatorlar faolligi (jonli)</CardTitle>
        <span
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] dark:border-slate-800 dark:bg-slate-900"
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
      </CardHeader>
      <CardContent className="space-y-2">
        {ops.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            Operator yo'q
          </p>
        )}
        {ops.map((o) => (
          <OperatorRow
            key={o.id}
            op={o}
            nowMs={nowMs}
            flash={flash.has(o.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function OperatorRow({
  op,
  nowMs,
  flash,
}: {
  op: OperatorActivity;
  nowMs: number;
  flash: boolean;
}) {
  const lastMs = op.lastActiveAt ? Date.parse(op.lastActiveAt) : null;
  const idle = lastMs === null || nowMs - lastMs > IDLE_MS;
  const target = op.target > 0 ? op.target : 0;
  const pct = target > 0 ? Math.min(100, Math.round((op.attempted / target) * 100)) : 0;

  return (
    <div
      className={
        "rounded-xl border p-3 transition-colors duration-700 " +
        (flash
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900")
      }
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusDot idle={idle} />
          <span className="font-medium text-slate-800 dark:text-slate-100">{op.name}</span>
          <span
            className={
              "rounded-full px-2 py-0.5 text-[11px] font-medium " +
              (idle
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")
            }
          >
            {idle ? "Bo'sh" : "Faol"}
          </span>
        </div>
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {op.successful}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            / {op.attempted} urinish
          </span>
        </div>
      </div>
      <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-primary-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[11px] text-slate-400 dark:text-slate-500">
        Oxirgi faollik: {relativeTime(lastMs, nowMs)}
      </div>
    </div>
  );
}

function StatusDot({ idle }: { idle: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5" aria-hidden>
      {!idle && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={
          "relative inline-flex h-2.5 w-2.5 rounded-full " +
          (idle ? "bg-amber-400" : "bg-emerald-500")
        }
      />
    </span>
  );
}

/** Insonga o'qiladigan "necha vaqt oldin" (oddiy, kutubxonasiz). */
function relativeTime(ms: number | null, nowMs: number): string {
  if (ms === null) return "bugun faollik yo'q";
  const diff = Math.max(0, nowMs - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hozirgina";
  if (min < 60) return `${min} daqiqa oldin`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} soat oldin`;
  const day = Math.floor(hr / 24);
  return `${day} kun oldin`;
}

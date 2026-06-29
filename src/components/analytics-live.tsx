"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, PhoneCall, MessageSquare, Wifi, Tv, UserMinus } from "lucide-react";
import { ReminderButton } from "@/components/reminder-button";
import { DistributeButton } from "@/components/distribute-button";
import { releaseOperatorLeads } from "@/actions/distribution";
import { toast } from "@/components/toaster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarList } from "@/components/bar-list";
import type { Analytics, OperatorStat } from "@/lib/analytics";

const POLL_MS = 7000;

type Period = "today" | "week" | "month";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Bugun" },
  { key: "week", label: "Hafta" },
  { key: "month", label: "Oy" },
];

function periodVals(o: OperatorStat, p: Period) {
  if (p === "week") return { talked: o.weekTalked, calls: o.weekCalls };
  if (p === "month") return { talked: o.monthTalked, calls: o.monthCalls };
  return { talked: o.todayTalked, calls: o.todayCalls };
}

const statusTone: Record<string, "green" | "amber" | "slate"> = {
  ACTIVE: "green",
  PENDING: "amber",
  INACTIVE: "slate",
};

export function AnalyticsLive({ initial }: { initial: Analytics }) {
  const [data, setData] = useState<Analytics>(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [live, setLive] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [releasing, setReleasing] = useState<string | null>(null);
  const prev = useRef<Analytics>(initial);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next: Analytics = await res.json();

      // O'zgargan (qo'ng'iroqlari ko'paygan) operatorlarni belgilab, flash beramiz
      const changed = new Set<string>();
      const prevById = new Map(prev.current.operators.map((o) => [o.id, o]));
      for (const o of next.operators) {
        const p = prevById.get(o.id);
        if (p && (o.todayCalls !== p.todayCalls || o.todayTalked !== p.todayTalked)) {
          changed.add(o.id);
        }
      }
      prev.current = next;
      setData(next);
      setUpdatedAt(new Date());
      setLive(true);
      if (changed.size) {
        setFlash(changed);
        const t = setTimeout(() => setFlash(new Set()), 1600);
        timers.current.push(t);
      }
    } catch {
      setLive(false); // tarmoq xatosi — oxirgi ma'lumot saqlanadi
    }
  }, []);

  // Xodim kelmaganda — bugungi lidlarini bo'shatish
  async function onRelease(o: OperatorStat) {
    if (o.assigned === 0 || releasing) return;
    if (
      !confirm(
        `"${o.name}" ishga kelmadi deb belgilanadimi?\n\nUning bugungi ${o.assigned} ta lidi biriktirishdan bo'shatiladi va boshqa operatorga berish mumkin bo'ladi.`,
      )
    )
      return;
    setReleasing(o.id);
    try {
      const res = await releaseOperatorLeads(o.id);
      if (res.ok) {
        toast(`${res.released} lid bo'shatildi — endi /mijozlar'da boshqa operatorga bering`, "success");
        await refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    } finally {
      setReleasing(null);
    }
  }

  useEffect(() => {
    setUpdatedAt(new Date(initial.ts));
    const id = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(id);
      timers.current.forEach(clearTimeout);
    };
  }, [refresh, initial.ts]);

  const c = data.clients;
  const t = data.totals;

  const ops = [...data.operators].sort((a, b) => {
    const pa = periodVals(a, period).talked;
    const pb = periodVals(b, period).talked;
    if (pb !== pa) return pb - pa;
    return periodVals(b, period).calls - periodVals(a, period).calls;
  });
  const maxTalked = Math.max(1, ...ops.map((o) => periodVals(o, period).talked));

  const teamCards = [
    { label: "Bugun", talked: t.todayTalked, calls: t.todayCalls, tone: "blue" },
    { label: "Bu hafta", talked: t.weekTalked, calls: t.weekCalls, tone: "violet" },
    { label: "Bu oy", talked: t.monthTalked, calls: t.monthCalls, tone: "emerald" },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Sarlavha + jonli indikator */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jonli analitika</h1>
          <p className="text-sm text-slate-500">
            Operatorlar faolligi va mijozlar holati — real vaqtda
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <DistributeButton />
        <ReminderButton />
        <a
          href="/tablo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700"
        >
          <Tv className="h-4 w-4" />
          Televizor ko'rinishi
        </a>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs">
          <span className="relative flex h-2.5 w-2.5">
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={
                "relative inline-flex h-2.5 w-2.5 rounded-full " +
                (live ? "bg-emerald-500" : "bg-slate-300")
              }
            />
          </span>
          <span className="font-medium text-slate-700">
            {live ? "Jonli" : "Ulanish yo'q"}
          </span>
          {updatedAt && (
            <span className="text-slate-400">
              · {updatedAt.toLocaleTimeString("ru-RU")}
            </span>
          )}
        </div>
        </div>
      </div>

      {/* Mijozlar xulosasi */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Jami mijozlar</div>
              <div className="mt-1 text-3xl font-semibold text-slate-900">
                {c.total}
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {c.assigned} biriktirilgan · {c.unassigned} biriktirilmagan
          </div>
        </Card>

        {c.byStatus.map((s) => (
          <Card key={s.key} className="p-5">
            <div className="text-sm text-slate-500">{s.label}</div>
            <div className="mt-1 flex items-end gap-2">
              <div className="text-3xl font-semibold text-slate-900">{s.count}</div>
              <Badge tone={statusTone[s.key] ?? "neutral"} className="mb-1">
                {c.total ? Math.round((s.count / c.total) * 100) : 0}%
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      {/* Jamoa natijalari (bugun/hafta/oy) */}
      <div className="grid gap-4 sm:grid-cols-3">
        {teamCards.map((tc) => (
          <Card key={tc.label} className="p-5">
            <div className="text-sm text-slate-500">{tc.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-slate-900">{tc.talked}</span>
              <span className="text-sm text-slate-400">gaplashildi</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <PhoneCall className="h-3.5 w-3.5" />
              {tc.calls} qo'ng'iroq
            </div>
          </Card>
        ))}
      </div>

      {/* Operatorlar — jonli leaderboard */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            Operatorlar — gaplashgan lidlar
          </CardTitle>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                  (period === p.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {ops.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Operator yo'q</p>
          )}
          {ops.map((o, i) => {
            const v = periodVals(o, period);
            const pct = Math.round((v.talked / maxTalked) * 100);
            const isFlash = flash.has(o.id);
            return (
              <div
                key={o.id}
                className={
                  "rounded-xl border p-3 transition-colors duration-700 " +
                  (isFlash
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white")
                }
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                      {i + 1}
                    </span>
                    <span className="font-medium text-slate-800">{o.name}</span>
                    <span className="text-xs text-slate-400">
                      · {o.assigned} mijoz
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="text-lg font-semibold text-emerald-600">
                        {v.talked}
                      </span>
                      <span className="text-xs text-slate-400">/ {v.calls} qo'ng'iroq</span>
                    </div>
                    {o.assigned > 0 && (
                      <button
                        type="button"
                        onClick={() => onRelease(o)}
                        disabled={releasing === o.id}
                        title="Xodim kelmadi — bugungi lidlarini bo'shatish"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        {releasing === o.id ? "..." : "Bo'shatish"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Lead bo'limlari taqsimoti */}
      {c.byStage.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-slate-400" />
                Mijozlar holati bo'yicha
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarList
                items={c.byStatus.map((s) => ({ label: s.label, value: s.count }))}
                color="blue"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lid bosqichi bo'yicha</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList
                items={c.byStage.map((s) => ({ label: s.label, value: s.count }))}
                color="violet"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, PhoneCall, Users, Wifi, WifiOff } from "lucide-react";
import type { Analytics } from "@/lib/analytics";
import { LEAD_LIMITS } from "@/lib/constants";

const POLL_MS = 5000;

function Meter({
  label,
  value,
  limit,
  color,
}: {
  label: string;
  value: number;
  limit: number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((value / limit) * 100));
  const done = value >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm lg:text-base">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold">
          {value}
          <span className="text-slate-500"> / {limit}</span>
          {done && <span className="ml-1 text-emerald-400">✓</span>}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={"h-full rounded-full transition-all duration-500 " + color}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TvBoard({ initial }: { initial: Analytics }) {
  const [data, setData] = useState<Analytics>(initial);
  const [live, setLive] = useState(true);
  const [clock, setClock] = useState<Date | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const prev = useRef<Analytics>(initial);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next: Analytics = await res.json();
      const changed = new Set<string>();
      const byId = new Map(prev.current.operators.map((o) => [o.id, o]));
      for (const o of next.operators) {
        const p = byId.get(o.id);
        if (p && o.todayTalked > p.todayTalked) changed.add(o.id);
      }
      prev.current = next;
      setData(next);
      setLive(true);
      if (changed.size) {
        setFlash(changed);
        timers.current.push(setTimeout(() => setFlash(new Set()), 2200));
      }
    } catch {
      setLive(false);
    }
  }, []);

  useEffect(() => {
    setClock(new Date());
    const c = setInterval(() => setClock(new Date()), 1000);
    const p = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(c);
      clearInterval(p);
      timers.current.forEach(clearTimeout);
    };
  }, [refresh]);

  const day = [...data.operators]
    .filter((o) => o.dayShift)
    .sort((a, b) => b.todayTalked - a.todayTalked || b.todayCalls - a.todayCalls);
  const leader = day[0];
  const rest = day.slice(1);
  const n = Math.max(1, day.length);
  const teamToday = day.reduce((s, o) => s + o.todayTalked, 0);
  const teamWeek = day.reduce((s, o) => s + o.weekTalked, 0);
  const teamMonth = day.reduce((s, o) => s + o.monthTalked, 0);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-6 text-white lg:px-12 lg:py-10">
      {/* Sarlavha + soat */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight lg:text-5xl">TP TEXNIK XIZMAT</h1>
          <p className="mt-1 text-base text-amber-300 lg:text-xl">
            Kunduzgi smena · jonli natijalar · limit {LEAD_LIMITS.daily}/kun
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-4xl font-bold tabular-nums lg:text-6xl">
            {clock ? clock.toLocaleTimeString("ru-RU") : "--:--:--"}
          </div>
          <div className="mt-1 flex items-center justify-end gap-2 text-sm text-slate-400 lg:text-base">
            {clock?.toLocaleDateString("uz-UZ", { day: "2-digit", month: "long", weekday: "long" })}
            <span
              className={
                "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium " +
                (live ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300")
              }
            >
              {live ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {live ? "Jonli" : "Ulanmoqda"}
            </span>
          </div>
        </div>
      </div>

      {/* Eng yaxshi xodim — katta hero box */}
      {leader && (
        <div
          className={
            "relative mt-8 overflow-hidden rounded-3xl border-2 p-8 transition-all duration-700 lg:p-10 " +
            (flash.has(leader.id) ? "scale-[1.01] " : "") +
            "border-amber-400/60 bg-gradient-to-br from-amber-500/25 via-amber-400/10 to-transparent shadow-[0_0_60px_-15px_rgba(251,191,36,0.5)]"
          }
        >
          <div className="absolute right-6 top-6 hidden lg:block">
            <Crown className="h-20 w-20 animate-pulse text-amber-400/30" />
          </div>
          <div className="flex items-center gap-2 text-amber-300">
            <Crown className="h-6 w-6 lg:h-8 lg:w-8" />
            <span className="text-lg font-bold uppercase tracking-widest lg:text-2xl">Eng faol xodim</span>
          </div>
          <div className="mt-4 grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="text-5xl font-black lg:text-7xl">{leader.name}</div>
              <div className="mt-3 flex items-center gap-5 text-slate-300 lg:text-xl">
                <span className="inline-flex items-center gap-2">
                  <PhoneCall className="h-5 w-5" /> {leader.todayCalls} qo'ng'iroq
                </span>
                <span className="inline-flex items-center gap-2">
                  <Users className="h-5 w-5" /> {leader.assigned} mijoz
                </span>
              </div>
              {/* Hafta / Oy limit progress */}
              <div className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2">
                <Meter label="Bu hafta" value={leader.weekTalked} limit={LEAD_LIMITS.weekly} color="bg-emerald-400" />
                <Meter label="Bu oy" value={leader.monthTalked} limit={LEAD_LIMITS.monthly} color="bg-blue-400" />
              </div>
            </div>
            <div className="text-right">
              <div className="text-7xl font-black leading-none text-amber-300 lg:text-9xl">
                {leader.todayTalked}
                <span className="text-3xl font-bold text-amber-200/60 lg:text-5xl"> / {LEAD_LIMITS.daily}</span>
              </div>
              <div className="mt-1 text-lg font-medium uppercase tracking-wide text-amber-200/80 lg:text-2xl">
                bugun · gaplashgan lid
              </div>
              <div className="ml-auto mt-3 h-3 w-full max-w-md overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((leader.todayTalked / LEAD_LIMITS.daily) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Qolgan xodimlar — katta boxlar */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((o, i) => {
          const rank = i + 2;
          const pct = Math.min(100, Math.round((o.todayTalked / LEAD_LIMITS.daily) * 100));
          const accent = rank === 2 ? "text-slate-200" : rank === 3 ? "text-orange-300" : "text-slate-300";
          return (
            <div
              key={o.id}
              className={
                "rounded-2xl border p-6 transition-all duration-700 " +
                (flash.has(o.id)
                  ? "scale-[1.02] border-emerald-400/70 bg-emerald-500/10"
                  : "border-white/10 bg-white/5")
              }
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-slate-300">
                  {rank}
                </span>
                <span className="text-sm text-slate-400">{o.assigned} mijoz</span>
              </div>
              <div className="mt-3 text-3xl font-bold lg:text-4xl">{o.name}</div>
              <div className="mt-3 flex items-end gap-2">
                <span className={"text-6xl font-black lg:text-7xl " + accent}>{o.todayTalked}</span>
                <span className="mb-2 text-2xl font-bold text-slate-500">/ {LEAD_LIMITS.daily}</span>
              </div>
              <div className="text-sm text-slate-400">bugun gaplashgan lid · {o.todayCalls} qo'ng'iroq</div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-4 space-y-2.5">
                <Meter label="Bu hafta" value={o.weekTalked} limit={LEAD_LIMITS.weekly} color="bg-emerald-400" />
                <Meter label="Bu oy" value={o.monthTalked} limit={LEAD_LIMITS.monthly} color="bg-blue-400" />
              </div>
            </div>
          );
        })}
      </div>

      {day.length === 0 && (
        <p className="mt-20 text-center text-2xl text-slate-500">
          Kunduzgi smenada faol operator topilmadi
        </p>
      )}

      {/* Pastki qator — jamoa natijalari (limit = limit × xodim soni) */}
      <div className="mt-8 grid grid-cols-1 gap-5 border-t border-white/10 pt-6 sm:grid-cols-3">
        <TeamStat label="Bugun (jamoa)" value={teamToday} limit={LEAD_LIMITS.daily * n} tone="amber" />
        <TeamStat label="Bu hafta (jamoa)" value={teamWeek} limit={LEAD_LIMITS.weekly * n} tone="emerald" />
        <TeamStat label="Bu oy (jamoa)" value={teamMonth} limit={LEAD_LIMITS.monthly * n} tone="blue" />
      </div>

      {/* Mijozlar holati bo'yicha — ixcham qator */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-2xl bg-white/5 px-5 py-3 text-base lg:text-lg">
        <span className="font-semibold text-slate-200">
          Mijozlar: <span className="text-white">{data.clients.total}</span>
        </span>
        <span className="h-4 w-px bg-white/10" />
        {data.clients.byStatus.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span className={"h-2.5 w-2.5 rounded-full " + statusDot(s.key)} />
            <span className="text-slate-400">{s.label}</span>
            <span className={"font-bold " + statusText(s.key)}>{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function statusDot(key: string): string {
  if (key === "ACTIVE") return "bg-emerald-400";
  if (key === "PENDING") return "bg-amber-400";
  return "bg-slate-400";
}
function statusText(key: string): string {
  if (key === "ACTIVE") return "text-emerald-300";
  if (key === "PENDING") return "text-amber-300";
  return "text-slate-300";
}

function TeamStat({
  label,
  value,
  limit,
  tone,
}: {
  label: string;
  value: number;
  limit: number;
  tone: "amber" | "emerald" | "blue";
}) {
  const color = { amber: "text-amber-300", emerald: "text-emerald-300", blue: "text-blue-300" }[tone];
  const bar = { amber: "bg-amber-400", emerald: "bg-emerald-400", blue: "bg-blue-400" }[tone];
  const pct = Math.min(100, Math.round((value / limit) * 100));
  return (
    <div className="rounded-2xl bg-white/5 p-5 text-center">
      <div className={"text-5xl font-black lg:text-6xl " + color}>
        {value}
        <span className="text-2xl font-bold text-slate-500"> / {limit}</span>
      </div>
      <div className="mt-1 text-sm text-slate-400 lg:text-base">{label}</div>
      <div className="mx-auto mt-2 h-2 w-full max-w-[180px] overflow-hidden rounded-full bg-white/10">
        <div className={"h-full rounded-full " + bar} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Eskalatsiya statistikasi paneli (boshliq/admin) — /eskalatsiya sahifasi tepasida.
import { Activity, AlertTriangle, Timer, CheckCircle2, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type EscalationStats } from "@/lib/escalation-stats";

/** Soatni odam o'qiydigan ko'rinishga: <24s → soat, aks holda kun. */
function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 24) return `${Math.round(hours)} soat`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} kun`;
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone = "slate",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "slate" | "red" | "sky" | "emerald";
}) {
  const toneCls: Record<string, string> = {
    slate: "text-slate-700 dark:text-slate-200",
    red: "text-red-600 dark:text-red-400",
    sky: "text-sky-600 dark:text-sky-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

export function EscalationStatsPanel({ stats }: { stats: EscalationStats }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Eskalatsiya statistikasi{" "}
          <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
            · oxirgi 30 kun
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Faol eskalatsiya"
            value={String(stats.activeTotal)}
            hint="navbatda + ustada"
          />
          <Metric
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="SLA buzilgan"
            value={`${stats.overduePct}%`}
            hint={`${stats.overdue} ta · 3 kundan oshgan`}
            tone="red"
          />
          <Metric
            icon={<Timer className="h-3.5 w-3.5" />}
            label="O'rtacha hal vaqti"
            value={formatDuration(stats.avgResolveHours)}
            hint="biriktirilgandan yakungacha"
            tone="sky"
          />
          <Metric
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Yakunlangan"
            value={String(stats.resolvedLast30)}
            hint="oxirgi 30 kunda"
            tone="emerald"
          />
        </div>

        {stats.ustaRanking.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Wrench className="h-3.5 w-3.5" />
              Usta reytingi (eng ko'p yakunlagan)
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {stats.ustaRanking.map((u, i) => (
                <li
                  key={u.ustaId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      {i + 1}
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-200">{u.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {u.done} ta
                    </span>
                    <span className="tabular-nums">o'rtacha {formatDuration(u.avgHours)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

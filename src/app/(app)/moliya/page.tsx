import {
  Wallet,
  TrendingDown,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Users,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList } from "@/components/bar-list";
import { LineChart, MonthlyFlowChart } from "@/components/finance-charts";
import { getFinanceOverview, type Money } from "@/lib/finance";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moliya" };

/** Ikki valyutani birga: "$385 + 450 000 so'm". */
function money2(m: Money): string {
  const parts: string[] = [];
  if (m.USD > 0) parts.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) parts.push(formatMoney(m.UZS, "UZS"));
  return parts.length ? parts.join(" + ") : formatMoney(0, "USD");
}

/** Grafik o'qi uchun ixcham summa: 12 340 -> "12.3k". */
function compact(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "emerald" | "red" | "amber" | "slate";
}) {
  const toneMap = {
    blue: "bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {value}
          </div>
          {sub && <div className="text-xs text-slate-400 dark:text-slate-500">{sub}</div>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default async function FinancePage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const fin = await getFinanceOverview(12);

  const hasUsd = fin.months.some((m) => m.mrr.USD > 0);
  const hasUzs = fin.months.some((m) => m.mrr.UZS > 0);

  const agingItems = fin.aging.map((b) => ({ label: b.label, value: b.count }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Moliya</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Oylik takroriy daromad (MRR), mijoz oqimi va qarzdorlik tahlili
        </p>
      </div>

      {/* KPI kartalar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="MRR (oylik takroriy daromad)"
          value={money2(fin.mrr)}
          sub={`${fin.activeClients} faol mijoz`}
          icon={Wallet}
          tone="emerald"
        />
        <Kpi
          label="Churn (bu oy)"
          value={`${fin.churnRate}%`}
          sub={`${fin.lostThisMonth} mijoz yo'qotildi`}
          icon={TrendingDown}
          tone="red"
        />
        <Kpi
          label="Yangi mijoz (bu oy)"
          value={String(fin.newThisMonth)}
          sub={`Yo'qotilgan: ${fin.lostThisMonth}`}
          icon={UserPlus}
          tone="blue"
        />
        <Kpi
          label="Qarzdorlik (muddati o'tgan)"
          value={money2(fin.overdueSum)}
          sub={`${fin.overdueCount} mijoz`}
          icon={AlertTriangle}
          tone="amber"
        />
        <Kpi
          label="Jami mijozlar"
          value={String(fin.totalClients)}
          sub={`Nofaol: ${fin.inactiveClients}`}
          icon={Users}
          tone="slate"
        />
        <Kpi
          label="Sof o'sish (bu oy)"
          value={`${fin.newThisMonth - fin.lostThisMonth >= 0 ? "+" : ""}${fin.newThisMonth - fin.lostThisMonth}`}
          sub="Yangi − yo'qotilgan"
          icon={UserMinus}
          tone={fin.newThisMonth - fin.lostThisMonth >= 0 ? "emerald" : "red"}
        />
      </div>

      {/* MRR trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(hasUsd || !hasUzs) && (
          <Card>
            <CardHeader>
              <CardTitle>MRR o'sishi{hasUzs ? " — USD" : ""}</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                points={fin.months.map((m) => ({ label: m.label, value: m.mrr.USD }))}
                format={(n) => `$${compact(n)}`}
                colorClass="text-emerald-500"
              />
            </CardContent>
          </Card>
        )}
        {hasUzs && (
          <Card>
            <CardHeader>
              <CardTitle>MRR o'sishi — so'm</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                points={fin.months.map((m) => ({ label: m.label, value: m.mrr.UZS }))}
                format={(n) => compact(n)}
                colorClass="text-primary-500"
              />
            </CardContent>
          </Card>
        )}
        {/* Oylik oqim */}
        <Card className={hasUsd && hasUzs ? "lg:col-span-2" : ""}>
          <CardHeader>
            <CardTitle>Mijoz oqimi (yangi / yo'qotilgan)</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyFlowChart
              months={fin.months.map((m) => ({
                label: m.label,
                newCount: m.newCount,
                lostCount: m.lostCount,
              }))}
            />
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Yangi
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Yo'qotilgan
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Qarzdorlik yoshi */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Qarzdorlik yoshi (mijoz soni)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={agingItems} color="amber" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Qarzdorlik yoshi (summa)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {fin.aging.map((b) => (
                <div key={b.key} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-slate-800">
                  <span className="text-slate-700 dark:text-slate-200">{b.label}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {b.count > 0 ? money2(b.sum) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { startOfMonth } from "date-fns";
import {
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  Banknote,
  AlertTriangle,
  Wrench,
  FileDown,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList } from "@/components/bar-list";
import { SendReportButtons } from "@/components/send-report-buttons";
import { formatMoney } from "@/lib/utils";
import { paymentState } from "@/lib/payment-status";
import { callResultLabel } from "@/lib/constants";

type Money = { USD: number; UZS: number };

function bucket(target: Money, currency: string, amount: number) {
  target[currency === "UZS" ? "UZS" : "USD"] += amount;
}

/** Ikki valyutani birga ko'rsatadi: "$385 + 450 000 so'm". */
function money2(m: Money): string {
  const parts: string[] = [];
  if (m.USD > 0) parts.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) parts.push(formatMoney(m.UZS, "UZS"));
  return parts.length ? parts.join(" + ") : formatMoney(0, "USD");
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
  tone: "blue" | "emerald" | "red" | "violet" | "slate" | "amber";
}) {
  const toneMap = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
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
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneMap[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default async function ReportsPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const monthStart = startOfMonth(new Date());

  const [
    clients,
    operators,
    monthPayments,
    monthCalls,
    openTickets,
    ustalar,
    ustaClients,
  ] = await Promise.all([
      db.client.findMany({
        select: {
          id: true,
          region: true,
          status: true,
          currency: true,
          monthlyAmount: true,
          nextPaymentDate: true,
          assignedToId: true,
        },
      }),
      db.user.findMany({
        where: { role: { in: ["OPERATOR", "ADMIN", "INSTALLER"] } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.payment.findMany({
        where: { paidAt: { gte: monthStart } },
        select: { amount: true, currency: true, recordedById: true },
      }),
      db.callLog.findMany({
        where: { calledAt: { gte: monthStart } },
        select: { operatorId: true, result: true },
      }),
      db.ticket.findMany({
        where: { status: { not: "RESOLVED" } },
        select: { assignedToId: true },
      }),
      db.user.findMany({
        where: { role: "INSTALLER" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.client.findMany({
        where: { assignedUstaId: { not: null } },
        select: { assignedUstaId: true, stage: true, ustaStatus: true },
      }),
    ]);

  const ustaStats = ustalar.map((u) => {
    const mine = ustaClients.filter((c) => c.assignedUstaId === u.id);
    return {
      name: u.name,
      active: mine.filter((c) => c.stage === "FORWARDED").length,
      done: mine.filter((c) => c.ustaStatus === "DONE").length,
    };
  });

  const total = clients.length;
  const activeClients = clients.filter((c) => c.status === "ACTIVE");
  const activeCount = activeClients.length;
  const pendingCount = clients.filter((c) => c.status === "PENDING").length;
  const inactiveCount = clients.filter((c) => c.status === "INACTIVE").length;
  const churnRate = total > 0 ? Math.round((inactiveCount / total) * 100) : 0;

  // Pul ko'rsatkichlari — valyuta bo'yicha alohida
  const mrr: Money = { USD: 0, UZS: 0 };
  for (const c of activeClients) bucket(mrr, c.currency, c.monthlyAmount);

  const collected: Money = { USD: 0, UZS: 0 };
  for (const p of monthPayments) bucket(collected, p.currency, p.amount);

  const overdueClients = activeClients.filter(
    (c) => paymentState(c.nextPaymentDate) === "OVERDUE",
  );
  const overdue: Money = { USD: 0, UZS: 0 };
  for (const c of overdueClients) bucket(overdue, c.currency, c.monthlyAmount);

  // Viloyat bo'yicha
  const regionMap = new Map<string, number>();
  for (const c of clients) {
    const r = c.region ?? "Belgilanmagan";
    regionMap.set(r, (regionMap.get(r) ?? 0) + 1);
  }
  const regionItems = [...regionMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const statusItems = [
    { label: "Faol", value: activeCount },
    { label: "Kutilmoqda", value: pendingCount },
    { label: "O'chirilgan", value: inactiveCount },
  ];

  // Qo'ng'iroq natijalari (bu oy)
  const resultMap = new Map<string, number>();
  for (const cl of monthCalls)
    resultMap.set(cl.result, (resultMap.get(cl.result) ?? 0) + 1);
  const resultItems = [...resultMap.entries()]
    .map(([key, value]) => ({ label: callResultLabel(key), value }))
    .sort((a, b) => b.value - a.value);

  // Operator statistikasi
  const callsByOp = new Map<string, number>();
  for (const cl of monthCalls)
    if (cl.operatorId)
      callsByOp.set(cl.operatorId, (callsByOp.get(cl.operatorId) ?? 0) + 1);

  const payByOp = new Map<string, Money>();
  for (const p of monthPayments) {
    if (!p.recordedById) continue;
    const e = payByOp.get(p.recordedById) ?? { USD: 0, UZS: 0 };
    bucket(e, p.currency, p.amount);
    payByOp.set(p.recordedById, e);
  }

  const ticketsByOp = new Map<string, number>();
  for (const t of openTickets)
    if (t.assignedToId)
      ticketsByOp.set(t.assignedToId, (ticketsByOp.get(t.assignedToId) ?? 0) + 1);

  const assignedByOp = new Map<string, number>();
  for (const c of clients)
    if (c.assignedToId)
      assignedByOp.set(c.assignedToId, (assignedByOp.get(c.assignedToId) ?? 0) + 1);

  const operatorStats = operators.map((op) => ({
    name: op.name,
    assigned: assignedByOp.get(op.id) ?? 0,
    calls: callsByOp.get(op.id) ?? 0,
    collected: money2(payByOp.get(op.id) ?? { USD: 0, UZS: 0 }),
    tickets: ticketsByOp.get(op.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Hisobot</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Umumiy ko'rsatkichlar, viloyat va operatorlar bo'yicha tahlil
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <a
            href="/api/report/pdf"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4" /> PDF hisobot
          </a>
          <SendReportButtons />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Jami mijozlar"
          value={String(total)}
          icon={Users}
          tone="blue"
        />
        <Kpi
          label="Faol mijozlar"
          value={String(activeCount)}
          icon={UserCheck}
          tone="emerald"
        />
        <Kpi
          label="MRR (oylik daromad)"
          value={money2(mrr)}
          sub="faol mijozlar bo'yicha"
          icon={TrendingUp}
          tone="violet"
        />
        <Kpi
          label="Bu oy yig'ilgan"
          value={money2(collected)}
          icon={Banknote}
          tone="emerald"
        />
        <Kpi
          label="Qarzdorlar"
          value={String(overdueClients.length)}
          sub={money2(overdue)}
          icon={AlertTriangle}
          tone="red"
        />
        <Kpi
          label="Ochiq muammolar"
          value={String(openTickets.length)}
          icon={Wrench}
          tone="amber"
        />
        <Kpi
          label="O'chirilgan (churn)"
          value={String(inactiveCount)}
          sub={`${churnRate}% churn`}
          icon={UserX}
          tone="slate"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Viloyatlar bo'yicha mijozlar</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={regionItems} color="blue" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Holat taqsimoti</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={statusItems} color="emerald" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operatorlar (bu oy)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Operator</th>
                  <th className="px-4 py-3 font-medium">Biriktirilgan mijoz</th>
                  <th className="px-4 py-3 font-medium">Qo'ng'iroqlar</th>
                  <th className="px-4 py-3 font-medium">Yig'im</th>
                  <th className="px-4 py-3 font-medium">Ochiq muammo</th>
                </tr>
              </thead>
              <tbody>
                {operatorStats.map((o) => (
                  <tr
                    key={o.name}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {o.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{o.assigned}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{o.calls}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{o.collected}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{o.tickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {ustaStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ustalar (vazifalar)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                    <th className="px-4 py-3 font-medium">Usta</th>
                    <th className="px-4 py-3 font-medium">Faol vazifa</th>
                    <th className="px-4 py-3 font-medium">Bajarilgan</th>
                  </tr>
                </thead>
                <tbody>
                  {ustaStats.map((u) => (
                    <tr
                      key={u.name}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {u.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.active}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Qo'ng'iroq natijalari (bu oy)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarList items={resultItems} color="violet" />
        </CardContent>
      </Card>
    </div>
  );
}

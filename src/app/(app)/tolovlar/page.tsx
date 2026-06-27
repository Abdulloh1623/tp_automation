import Link from "next/link";
import { startOfMonth } from "date-fns";
import { AlertTriangle, CalendarClock, Banknote, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentStatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney, daysUntil } from "@/lib/utils";
import { paymentState, paymentUrgency } from "@/lib/payment-status";

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "red" | "amber" | "emerald";
}) {
  const toneMap = {
    red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
        </div>
      </div>
    </Card>
  );
}

export default async function PaymentsPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const clients = await db.client.findMany({
    where: { status: "ACTIVE" },
    include: { assignedTo: { select: { name: true } } },
  });

  const monthStart = startOfMonth(new Date());
  const monthPayments = await db.payment.findMany({
    where: { paidAt: { gte: monthStart } },
  });

  // Holatlarni hisoblash
  const withState = clients
    .map((c) => ({ c, state: paymentState(c.nextPaymentDate) }))
    .sort((a, b) => {
      const u = paymentUrgency(a.state) - paymentUrgency(b.state);
      if (u !== 0) return u;
      const da = a.c.nextPaymentDate?.getTime() ?? Infinity;
      const dbt = b.c.nextPaymentDate?.getTime() ?? Infinity;
      return da - dbt;
    });

  const overdue = withState.filter((x) => x.state === "OVERDUE");
  const dueToday = withState.filter((x) => x.state === "DUE_TODAY");

  const overdueUsd = overdue
    .filter((x) => x.c.currency === "USD")
    .reduce((sum, x) => sum + x.c.monthlyAmount, 0);

  const collectedUsd = monthPayments
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">To'lovlar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Obuna holati va to'lov yig'imi
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Muddati o'tgan"
          value={`${overdue.length} ta · ${formatMoney(overdueUsd, "USD")}`}
          icon={AlertTriangle}
          tone="red"
        />
        <Metric
          label="Bugun to'lov kuni"
          value={`${dueToday.length} ta`}
          icon={CalendarClock}
          tone="amber"
        />
        <Metric
          label="Bu oy yig'ilgan (USD)"
          value={formatMoney(collectedUsd, "USD")}
          icon={Banknote}
          tone="emerald"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Faol mijozlar — to'lov bo'yicha</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Mijoz</th>
                  <th className="px-4 py-3 font-medium">Holat</th>
                  <th className="px-4 py-3 font-medium">Keyingi to'lov</th>
                  <th className="px-4 py-3 font-medium">Qoldi</th>
                  <th className="px-4 py-3 font-medium">Oylik</th>
                  <th className="px-4 py-3 font-medium">Operator</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {withState.map(({ c, state }) => {
                  const d = daysUntil(c.nextPaymentDate);
                  const qoldi =
                    d === null
                      ? "—"
                      : d < 0
                        ? `${Math.abs(d)} kun o'tdi`
                        : d === 0
                          ? "bugun"
                          : `${d} kun`;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {c.restaurantName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{c.fullName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge nextPaymentDate={c.nextPaymentDate} />
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatDate(c.nextPaymentDate)}
                      </td>
                      <td
                        className={
                          "px-4 py-3 " +
                          (state === "OVERDUE"
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-600 dark:text-slate-300")
                        }
                      >
                        {qoldi}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                        {formatMoney(c.monthlyAmount, c.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {c.assignedTo?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/mijozlar/${c.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
                        >
                          To'lov
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { endOfDay, format, startOfDay, startOfMonth, subDays } from "date-fns";
import { Phone, ArrowRight, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarList } from "@/components/bar-list";
import { CallResultBadge } from "@/components/status-badge";
import {
  DashboardStatCard,
  type CardDetail,
} from "@/components/dashboard-stat-card";
import { formatMoney, formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { PhoneCopyButton } from "@/components/phone-copy";
import { callResultLabel } from "@/lib/constants";
import { paymentState, paymentUrgency } from "@/lib/payment-status";

type Money = { USD: number; UZS: number };
function addMoney(m: Money, cur: string, amt: number) {
  m[cur === "UZS" ? "UZS" : "USD"] += amt;
}
function money2(m: Money): string {
  const p: string[] = [];
  if (m.USD > 0) p.push(formatMoney(m.USD, "USD"));
  if (m.UZS > 0) p.push(formatMoney(m.UZS, "UZS"));
  return p.length ? p.join(" + ") : "$0";
}
const hhmm = (d: Date) => format(d, "HH:mm");
const dash = (s: string | null | undefined) => (s && s.trim() ? s : "—");
const joinDot = (parts: (string | null | undefined)[]) =>
  parts.filter((x) => x && String(x).trim()).join(" · ") || undefined;

const REASON_META: Record<string, { label: string; tone: "red" | "amber" | "blue" | "slate" }> = {
  overdue: { label: "Muddati o'tgan to'lov", tone: "red" },
  due_today: { label: "Bugun to'lov kuni", tone: "amber" },
  followup: { label: "Rejalashtirilgan qo'ng'iroq", tone: "blue" },
  ticket: { label: "Ochiq muammo", tone: "slate" },
};

export default async function DashboardPage() {
  const session = await requireRole(["ADMIN"]);
  const now = new Date();
  const today = endOfDay(now);
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const trendStart = startOfDay(subDays(now, 13));

  const clients = await db.client.findMany({
    where: { status: "ACTIVE" },
    include: {
      assignedTo: { select: { name: true } },
      callLogs: { orderBy: { calledAt: "desc" }, take: 1 },
      tickets: { where: { status: { not: "RESOLVED" } }, select: { id: true } },
    },
  });

  const dueFollowups = await db.callLog.findMany({
    where: { nextFollowUpDate: { lte: today }, client: { status: "ACTIVE" } },
    select: { clientId: true },
  });
  const followupIds = new Set(dueFollowups.map((f) => f.clientId));

  const [
    statusGroups,
    monthPayments,
    operators,
    callsByOp,
    callsToday,
    newClients,
    doneCalls,
    doneReturns,
    escalatedCount,
    pendingReturns,
    trendCalls,
    lowStockTypes,
    whStockRows,
    unassignedCount,
    incompleteCount,
  ] = await Promise.all([
    db.client.groupBy({ by: ["status"], _count: true }),
    db.payment.findMany({
      where: { paidAt: { gte: monthStart } },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        clientId: true,
        amount: true,
        currency: true,
        paidAt: true,
        client: { select: { restaurantName: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    db.user.findMany({ where: { role: "OPERATOR", isActive: true }, select: { id: true, name: true, dailyLeadTarget: true }, orderBy: { name: "asc" } }),
    db.callLog.groupBy({ by: ["operatorId"], where: { calledAt: { gte: todayStart }, operatorId: { not: null } }, _count: true }),
    db.callLog.findMany({
      where: { calledAt: { gte: todayStart } },
      orderBy: { calledAt: "desc" },
      take: 100,
      select: {
        id: true,
        clientId: true,
        result: true,
        calledAt: true,
        client: { select: { restaurantName: true } },
        operator: { select: { name: true } },
      },
    }),
    db.client.findMany({
      where: { createdAt: { gte: monthStart } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        restaurantName: true,
        fullName: true,
        region: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
      },
    }),
    db.callLog.findMany({
      where: { result: "DONE", calledAt: { gte: todayStart } },
      orderBy: { calledAt: "desc" },
      take: 100,
      select: {
        id: true,
        clientId: true,
        calledAt: true,
        client: { select: { restaurantName: true } },
        operator: { select: { name: true } },
      },
    }),
    db.equipmentReturnRequest.findMany({
      where: { status: "DONE", resolvedAt: { gte: todayStart } },
      orderBy: { resolvedAt: "desc" },
      take: 100,
      select: {
        id: true,
        clientId: true,
        resolvedAt: true,
        client: { select: { restaurantName: true } },
      },
    }),
    db.client.count({ where: { stage: "ESCALATED" } }),
    db.equipmentReturnRequest.count({ where: { status: "PENDING" } }),
    db.callLog.findMany({ where: { calledAt: { gte: trendStart } }, select: { calledAt: true } }),
    db.equipmentType.findMany({ where: { isActive: true, minStock: { gt: 0 } }, select: { id: true, minStock: true } }),
    db.inventoryStock.findMany({ where: { locationType: "WAREHOUSE" }, select: { equipmentTypeId: true, quantity: true } }),
    db.client.count({ where: { assignedToId: null } }),
    db.client.count({ where: { OR: [{ phone: "" }, { restaurantName: "" }] } }),
  ]);

  // KPI / hisob-kitoblar
  const workList = clients
    .map((c) => {
      const pState = paymentState(c.nextPaymentDate);
      const reasons: string[] = [];
      if (pState === "OVERDUE") reasons.push("overdue");
      else if (pState === "DUE_TODAY") reasons.push("due_today");
      if (followupIds.has(c.id)) reasons.push("followup");
      if (c.tickets.length > 0) reasons.push("ticket");
      return { c, pState, reasons };
    })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => paymentUrgency(a.pState) - paymentUrgency(b.pState));

  const overdueClients = clients
    .filter((c) => paymentState(c.nextPaymentDate) === "OVERDUE")
    .sort(
      (a, b) =>
        (a.nextPaymentDate?.getTime() ?? 0) - (b.nextPaymentDate?.getTime() ?? 0),
    );
  const overdueCount = overdueClients.length;

  const mrr: Money = { USD: 0, UZS: 0 };
  const debt: Money = { USD: 0, UZS: 0 };
  for (const c of clients) {
    addMoney(mrr, c.currency, c.monthlyAmount);
    if (paymentState(c.nextPaymentDate) === "OVERDUE") addMoney(debt, c.currency, c.monthlyAmount);
  }
  const collected: Money = { USD: 0, UZS: 0 };
  const todayPay: Money = { USD: 0, UZS: 0 };
  const todayPayments = monthPayments.filter((p) => p.paidAt >= todayStart);
  for (const p of monthPayments) {
    addMoney(collected, p.currency, p.amount);
    if (p.paidAt >= todayStart) addMoney(todayPay, p.currency, p.amount);
  }

  const whQty = new Map(whStockRows.map((s) => [s.equipmentTypeId, s.quantity]));
  const lowStockCount = lowStockTypes.filter((t) => (whQty.get(t.id) ?? 0) < t.minStock).length;

  const statusCount = (s: string) => statusGroups.find((g) => g.status === s)?._count ?? 0;
  const statusItems = [
    { label: "Faol", value: statusCount("ACTIVE") },
    { label: "Kutilmoqda", value: statusCount("PENDING") },
    { label: "O'chirilgan", value: statusCount("INACTIVE") },
  ];

  const regionMap = new Map<string, number>();
  for (const c of clients) {
    const r = c.region ?? "Belgilanmagan";
    regionMap.set(r, (regionMap.get(r) ?? 0) + 1);
  }
  const regionItems = [...regionMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // 14 kunlik qo'ng'iroq tendensiyasi
  const dayKeys = Array.from({ length: 14 }, (_, i) => subDays(now, 13 - i).toISOString().slice(0, 10));
  const trendMap = new Map(dayKeys.map((k) => [k, 0]));
  for (const cl of trendCalls) {
    const k = cl.calledAt.toISOString().slice(0, 10);
    if (trendMap.has(k)) trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
  }
  const trendItems = dayKeys.map((k) => ({ label: `${k.slice(8)}.${k.slice(5, 7)}`, value: trendMap.get(k) ?? 0 }));

  const opCall = new Map(callsByOp.map((g) => [g.operatorId, g._count]));
  const opStats = operators
    .map((o) => ({ name: o.name, calls: opCall.get(o.id) ?? 0, target: o.dailyLeadTarget }))
    .sort((a, b) => b.calls - a.calls);

  const attention = [
    { label: "Eskalatsiya navbati", count: escalatedCount, href: "/eskalatsiya" },
    { label: "Uskuna qaytarish arizalari", count: pendingReturns, href: "/ombor" },
    { label: "Biriktirilmagan mijozlar", count: unassignedCount, href: "/mijozlar?assigned=__none__" },
    { label: "To'ldirilmagan ma'lumot", count: incompleteCount, href: "/toldirilmagan" },
    { label: "Kam zaxira (ombor)", count: lowStockCount, href: "/ombor" },
  ];

  // --- Karta tafsilotlari (bosilganda modal'da ko'rinadi) ---
  const ROW_CAP = 40;

  const activeDetail: CardDetail = {
    rows: clients.slice(0, ROW_CAP).map((c) => ({
      id: c.id,
      href: `/mijozlar/${c.id}`,
      title: dash(c.restaurantName) === "—" ? dash(c.fullName) : c.restaurantName,
      subtitle: joinDot([c.fullName, c.region, c.assignedTo?.name]),
      meta: formatMoney(c.monthlyAmount, c.currency),
    })),
    emptyText: "Faol mijoz yo'q",
    footerHref: "/mijozlar?status=ACTIVE",
    footerText: "Barcha faol mijozlar",
  };

  const workDetail: CardDetail = {
    rows: workList.slice(0, ROW_CAP).map(({ c, reasons }) => ({
      id: c.id,
      href: `/mijozlar/${c.id}`,
      title: dash(c.restaurantName) === "—" ? dash(c.fullName) : c.restaurantName,
      subtitle: reasons.map((r) => REASON_META[r].label).join(" · "),
      meta: formatDate(c.nextPaymentDate),
    })),
    emptyText: "Bugun shoshilinch ish yo'q — hammasi joyida",
  };

  const overdueDetail: CardDetail = {
    rows: overdueClients.slice(0, ROW_CAP).map((c) => ({
      id: c.id,
      href: `/mijozlar/${c.id}`,
      title: dash(c.restaurantName) === "—" ? dash(c.fullName) : c.restaurantName,
      subtitle: joinDot([c.fullName, formatPhone(c.phone), c.assignedTo?.name]),
      meta: formatMoney(c.monthlyAmount, c.currency),
      badge: { text: formatDate(c.nextPaymentDate), tone: "red" as const },
    })),
    emptyText: "Muddati o'tgan to'lov yo'q",
  };

  const newDetail: CardDetail = {
    rows: newClients.slice(0, ROW_CAP).map((c) => ({
      id: c.id,
      href: `/mijozlar/${c.id}`,
      title: dash(c.restaurantName) === "—" ? dash(c.fullName) : c.restaurantName,
      subtitle: joinDot([c.region, c.assignedTo?.name]),
      meta: formatDate(c.createdAt),
    })),
    emptyText: "Bu oy yangi mijoz yo'q",
  };

  const callsDetail: CardDetail = {
    rows: callsToday.map((l) => ({
      id: l.id,
      href: `/mijozlar/${l.clientId}`,
      title: dash(l.client.restaurantName),
      subtitle: joinDot([l.operator?.name, callResultLabel(l.result)]),
      meta: hhmm(l.calledAt),
    })),
    emptyText: "Bugun qo'ng'iroq qilinmagan",
  };

  const payDetail: CardDetail = {
    rows: todayPayments.map((p) => ({
      id: p.id,
      href: `/mijozlar/${p.clientId}`,
      title: dash(p.client.restaurantName),
      subtitle: joinDot([p.recordedBy?.name, hhmm(p.paidAt)]),
      meta: formatMoney(p.amount, p.currency),
    })),
    emptyText: "Bugun to'lov qabul qilinmagan",
    footerHref: "/tolovlar",
    footerText: "Barcha to'lovlar",
  };

  const doneDetail: CardDetail = {
    rows: [
      ...doneCalls.map((l) => ({
        id: `c${l.id}`,
        href: `/mijozlar/${l.clientId}`,
        title: dash(l.client.restaurantName),
        subtitle: joinDot(["O'rnatish / xizmat", l.operator?.name]),
        meta: hhmm(l.calledAt),
        _t: l.calledAt.getTime(),
      })),
      ...doneReturns.map((r) => ({
        id: `r${r.id}`,
        href: `/mijozlar/${r.clientId}`,
        title: dash(r.client.restaurantName),
        subtitle: "Uskuna qaytarish",
        meta: r.resolvedAt ? hhmm(r.resolvedAt) : "",
        _t: r.resolvedAt?.getTime() ?? 0,
      })),
    ]
      .sort((a, b) => b._t - a._t)
      .map(({ _t, ...row }) => row),
    emptyText: "Bugun bajarilgan vazifa yo'q",
  };

  const WORK_CAP = 12;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Boshqaruv paneli</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Xush kelibsiz{session ? `, ${session.name}` : ""} — {formatDate(now)}
        </p>
      </div>

      {/* Asosiy ko'rsatkichlar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard label="Faol mijozlar" value={String(clients.length)} icon="users" tone="blue" detail={activeDetail} />
        <DashboardStatCard label="Bugun ish ro'yxati" value={String(workList.length)} icon="phone" tone="indigo" hint="shoshilinch mijozlar" detail={workDetail} />
        <DashboardStatCard label="Muddati o'tgan to'lov" value={String(overdueCount)} icon="alert" tone="red" hint={money2(debt)} detail={overdueDetail} />
        <DashboardStatCard label="Bu oy yangi mijoz" value={String(newClients.length)} icon="userplus" tone="emerald" detail={newDetail} />
      </div>

      {/* Bugungi faollik */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Bugungi faollik</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <DashboardStatCard label="Qo'ng'iroqlar (bugun)" value={String(callsToday.length)} icon="phone" tone="blue" detail={callsDetail} />
          <DashboardStatCard label="To'lovlar (bugun)" value={`${todayPayments.length} · ${money2(todayPay)}`} icon="money" tone="emerald" detail={payDetail} />
          <DashboardStatCard label="Bajarilgan vazifa (bugun)" value={String(doneCalls.length + doneReturns.length)} icon="check" tone="indigo" detail={doneDetail} />
        </div>
      </div>

      {/* Daromad xulosasi */}
      <Card>
        <CardHeader><CardTitle>Daromad xulosasi</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="text-xs text-slate-500 dark:text-slate-400">Oylik daromad (MRR)</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{money2(mrr)}</div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-950 dark:bg-emerald-950/40">
            <div className="text-xs text-emerald-700 dark:text-emerald-300">Bu oy yig'ilgan</div>
            <div className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300">{money2(collected)}</div>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-950 dark:bg-red-950/40">
            <div className="text-xs text-red-700 dark:text-red-300">Qarzdorlik ({overdueCount} mijoz)</div>
            <div className="mt-1 text-xl font-semibold text-red-700 dark:text-red-300">{money2(debt)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Operatorlar + Diqqat */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Operatorlar (bugun)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {opStats.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">Operator yo'q</p>}
            {opStats.map((o) => {
              const pct = o.target > 0 ? Math.min(100, Math.round((o.calls / o.target) * 100)) : 0;
              return (
                <div key={o.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200">{o.name}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {o.calls}
                      <span className="text-slate-400 dark:text-slate-500"> / {o.target}</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={"h-full rounded-full " + (pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Diqqat talab qiladi</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {attention.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="text-sm text-slate-700 dark:text-slate-200">{a.label}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={a.count > 0 ? "amber" : "green"}>{a.count}</Badge>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-700" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Grafiklar */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Holat taqsimoti</CardTitle></CardHeader>
          <CardContent><BarList items={statusItems} color="emerald" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Viloyat bo'yicha (TOP)</CardTitle></CardHeader>
          <CardContent><BarList items={regionItems} color="blue" /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Qo'ng'iroqlar (oxirgi 14 kun)</CardTitle></CardHeader>
        <CardContent><BarList items={trendItems} color="violet" /></CardContent>
      </Card>

      {/* Bugungi ish ro'yxati */}
      <Card>
        <CardHeader>
          <CardTitle>Bugungi ish ro'yxati</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            To'lov kuni yetgan, rejalashtirilgan qo'ng'iroq yoki ochiq muammosi bor mijozlar
            {workList.length > WORK_CAP ? ` — ${workList.length} ta (birinchi ${WORK_CAP})` : ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {workList.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              Bugun shoshilinch ish yo'q — hammasi joyida
            </p>
          )}
          {workList.slice(0, WORK_CAP).map(({ c, reasons }) => {
            const lastCall = c.callLogs[0];
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{c.restaurantName}</div>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{c.fullName}</span>
                    {c.region && <span>· {c.region}</span>}
                    <span className="inline-flex items-center gap-1">
                      <a href={`tel:${normalizePhone(c.phone)}`} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <Phone className="h-3 w-3" />
                        {formatPhone(c.phone)}
                      </a>
                      <PhoneCopyButton phone={c.phone} />
                    </span>
                    {c.assignedTo && <span>· {c.assignedTo.name}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {reasons.map((r) => (
                      <Badge key={r} tone={REASON_META[r].tone}>{REASON_META[r].label}</Badge>
                    ))}
                    {lastCall && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                        oxirgi: <CallResultBadge result={lastCall.result} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatMoney(c.monthlyAmount, c.currency)}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{formatDate(c.nextPaymentDate)}</div>
                  </div>
                  <Link href={`/mijozlar/${c.id}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Ochish
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
          {workList.length > WORK_CAP && (
            <Link href="/mijozlar" className="block pt-1 text-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Barcha mijozlar →
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

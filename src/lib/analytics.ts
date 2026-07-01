import { startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import {
  CLIENT_STATUS,
  LEAD_STAGE,
  TALKED_RESULTS,
  clientStatusLabel,
  leadStageLabel,
} from "@/lib/constants";

/**
 * Kunduzgi smena belgisi: hozircha ism ichidagi "(kechki ...)" markeriga qarab
 * aniqlanadi (Mehroj = kechki). Kelajakda User.shift maydoni qo'shilsa shu yerda almashtiriladi.
 */
export function isDayShift(name: string): boolean {
  return !/kechki/i.test(name);
}

export type OperatorStat = {
  id: string;
  name: string;
  dayShift: boolean;
  assigned: number;
  todayCalls: number;
  todayTalked: number;
  weekCalls: number;
  weekTalked: number;
  monthCalls: number;
  monthTalked: number;
};

export type Breakdown = { key: string; label: string; count: number };

export type Analytics = {
  ts: string;
  clients: {
    total: number;
    assigned: number;
    unassigned: number;
    byStatus: Breakdown[];
    byStage: Breakdown[];
  };
  totals: {
    todayCalls: number;
    todayTalked: number;
    weekCalls: number;
    weekTalked: number;
    monthCalls: number;
    monthTalked: number;
  };
  operators: OperatorStat[];
};

/**
 * Real-time analitika ma'lumotlari. Sahifa (boshlang'ich render) va
 * `/api/analytics` (jonli polling) shu funksiyani ishlatadi.
 * "Gaplashildi" = operator mijozga yetgan natija (TALKED_RESULTS) — ko'tarmadi/
 * o'chiq/band emas. Operator lid holatini o'zgartirsa (natija tanlasa) +1 bo'ladi.
 */
export async function getAnalytics(): Promise<Analytics> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // dushanba
  const monthStart = startOfMonth(now);

  const [operators, assignedGroups, statusGroups, stageGroups, total, logs] =
    await Promise.all([
      db.user.findMany({
        where: { role: "OPERATOR", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.client.groupBy({ by: ["assignedToId"], _count: true }),
      db.client.groupBy({ by: ["status"], _count: true }),
      db.client.groupBy({ by: ["stage"], _count: true }),
      db.client.count(),
      db.callLog.findMany({
        where: { calledAt: { gte: monthStart } },
        select: { operatorId: true, result: true, calledAt: true },
      }),
    ]);

  const assignedMap = new Map<string, number>();
  let unassigned = 0;
  for (const g of assignedGroups) {
    if (g.assignedToId) assignedMap.set(g.assignedToId, g._count);
    else unassigned = g._count;
  }
  const assigned = total - unassigned;

  // Operator bo'yicha qo'ng'iroqlarni davr kesimida yig'ish
  type Acc = {
    todayCalls: number; todayTalked: number;
    weekCalls: number; weekTalked: number;
    monthCalls: number; monthTalked: number;
  };
  const blank = (): Acc => ({
    todayCalls: 0, todayTalked: 0, weekCalls: 0, weekTalked: 0, monthCalls: 0, monthTalked: 0,
  });
  const byOp = new Map<string, Acc>();
  const totals = blank();

  for (const l of logs) {
    // "Gaplashildi" — operator mijozga haqiqatan yetgan natija (ko'tarmadi/o'chiq/band emas)
    const talked = TALKED_RESULTS.includes(l.result);
    const inWeek = l.calledAt >= weekStart;
    const inToday = l.calledAt >= todayStart;

    totals.monthCalls++;
    if (talked) totals.monthTalked++;
    if (inWeek) { totals.weekCalls++; if (talked) totals.weekTalked++; }
    if (inToday) { totals.todayCalls++; if (talked) totals.todayTalked++; }

    if (!l.operatorId) continue;
    let a = byOp.get(l.operatorId);
    if (!a) { a = blank(); byOp.set(l.operatorId, a); }
    a.monthCalls++;
    if (talked) a.monthTalked++;
    if (inWeek) { a.weekCalls++; if (talked) a.weekTalked++; }
    if (inToday) { a.todayCalls++; if (talked) a.todayTalked++; }
  }

  const operatorStats: OperatorStat[] = operators.map((o) => {
    const a = byOp.get(o.id) ?? blank();
    return {
      id: o.id,
      name: o.name,
      dayShift: isDayShift(o.name),
      assigned: assignedMap.get(o.id) ?? 0,
      ...a,
    };
  });

  const statusCount = (k: string) =>
    statusGroups.find((g) => g.status === k)?._count ?? 0;
  const byStatus: Breakdown[] = (Object.keys(CLIENT_STATUS) as string[]).map((k) => ({
    key: k,
    label: clientStatusLabel(k),
    count: statusCount(k),
  }));

  const stageCount = (k: string) =>
    stageGroups.find((g) => g.stage === k)?._count ?? 0;
  const byStage: Breakdown[] = (Object.keys(LEAD_STAGE) as string[])
    .map((k) => ({ key: k, label: leadStageLabel(k), count: stageCount(k) }))
    .filter((b) => b.count > 0);

  return {
    ts: now.toISOString(),
    clients: { total, assigned, unassigned, byStatus, byStage },
    totals,
    operators: operatorStats,
  };
}

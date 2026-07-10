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

// --- Feature B: operatorning shaxsiy kunlik ko'rsatkichlari (jonli progress) ---

export type OperatorDailyStats = {
  ts: string;
  userId: string;
  name: string;
  assigned: number; // biriktirilgan mijozlar (jami)
  attempted: number; // bugun urinilgan aloqalar (har qanday CallLog)
  successful: number; // bugun gaplashilgan (TALKED_RESULTS)
  target: number; // kunlik maqsad (User.dailyLeadTarget)
};

/**
 * Bitta operatorning bugungi ko'rsatkichlari. Har bir lid holati o'zgarishi yoki
 * qo'ng'iroq yozuvi CallLog yaratadi — `attempted` shu yozuvlar soni,
 * `successful` esa gaplashilgan (ko'tarmadi/o'chiq/band emas) natijalar soni.
 * Sahifa (SSR boshlang'ich) ham, `/api/analytics/me` (polling) ham shuni ishlatadi.
 */
export async function getOperatorDailyStats(
  userId: string,
): Promise<OperatorDailyStats> {
  const now = new Date();
  const todayStart = startOfDay(now);

  const [user, assigned, logs] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, dailyLeadTarget: true },
    }),
    db.client.count({ where: { assignedToId: userId } }),
    db.callLog.findMany({
      where: { operatorId: userId, calledAt: { gte: todayStart } },
      select: { result: true },
    }),
  ]);

  let successful = 0;
  for (const l of logs) if (TALKED_RESULTS.includes(l.result)) successful++;

  return {
    ts: now.toISOString(),
    userId,
    name: user?.name ?? "",
    assigned,
    attempted: logs.length,
    successful,
    target: user?.dailyLeadTarget ?? 0,
  };
}

// --- Feature C: boshliq uchun operatorlar faolligi + idle detektori ---

export type OperatorActivity = {
  id: string;
  name: string;
  attempted: number; // bugun urinilgan aloqalar
  successful: number; // bugun gaplashilgan
  target: number; // kunlik maqsad
  lastActiveAt: string | null; // oxirgi faollik (eng so'nggi CallLog) — idle uchun
};

export type ActivityFeed = { ts: string; operators: OperatorActivity[] };

/**
 * Barcha faol operatorlarning bugungi aloqa jami + oxirgi faollik vaqti.
 * "Idle" holati klientda hisoblanadi (lastActiveAt 15 daqiqadan oshsa) — shu
 * bilan pollinglar orasida ham holat yangilanadi. Faollik signali sifatida
 * CallLog ishlatiladi (AuditLog ham muqobil, lekin CallLog operator faolligini
 * to'g'ridan-to'g'ri va indekslangan holda beradi).
 */
export async function getOperatorActivity(): Promise<ActivityFeed> {
  const now = new Date();
  const todayStart = startOfDay(now);

  const [operators, todayLogs, lastLogs] = await Promise.all([
    db.user.findMany({
      where: { role: "OPERATOR", isActive: true },
      select: { id: true, name: true, dailyLeadTarget: true },
      orderBy: { name: "asc" },
    }),
    db.callLog.findMany({
      where: { calledAt: { gte: todayStart }, operatorId: { not: null } },
      select: { operatorId: true, result: true },
    }),
    db.callLog.groupBy({
      by: ["operatorId"],
      where: { operatorId: { not: null } },
      _max: { calledAt: true },
    }),
  ]);

  type Acc = { attempted: number; successful: number };
  const byOp = new Map<string, Acc>();
  for (const l of todayLogs) {
    if (!l.operatorId) continue;
    let a = byOp.get(l.operatorId);
    if (!a) {
      a = { attempted: 0, successful: 0 };
      byOp.set(l.operatorId, a);
    }
    a.attempted++;
    if (TALKED_RESULTS.includes(l.result)) a.successful++;
  }

  const lastMap = new Map<string, Date | null>();
  for (const g of lastLogs) {
    if (g.operatorId) lastMap.set(g.operatorId, g._max.calledAt ?? null);
  }

  const list: OperatorActivity[] = operators.map((o) => {
    const a = byOp.get(o.id) ?? { attempted: 0, successful: 0 };
    const last = lastMap.get(o.id) ?? null;
    return {
      id: o.id,
      name: o.name,
      attempted: a.attempted,
      successful: a.successful,
      target: o.dailyLeadTarget,
      lastActiveAt: last ? last.toISOString() : null,
    };
  });

  // Eng so'nggi faol operatorlar tepada
  list.sort((a, b) => {
    const ta = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
    const tb = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
    return tb - ta;
  });

  return { ts: now.toISOString(), operators: list };
}

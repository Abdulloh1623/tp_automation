import { endOfDay, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import { getStatsResetAt } from "@/lib/settings";
import {
  ACTIVE_STAGES,
  CLIENT_STATUS,
  LEAD_STAGE,
  NO_CONTACT_STAGES,
  TALKED_RESULTS,
  callResultLabel,
  clientStatusLabel,
  leadStageLabel,
  type UserShift,
} from "@/lib/constants";
import { currentShift, shiftRange } from "@/lib/shift";

// --- Smena (shift) oynalari ---
// Ta'rif `lib/shift.ts` da (UTC+5 ni o'zi hisoblaydi) — bu yerda faqat
// orqaga moslik uchun qayta eksport qilinadi.
export type Shift = UserShift;
export { currentShift, shiftRange };

/**
 * Operatorning BUGUNGI lid ro'yxati mezoni — `/lidlar` sahifasi bilan AYNAN
 * bir xil: faol bosqichdagi muddati kelganlar + bugun ishlangan (pendingStage)
 * + qarzdorlar. Kunlik kvota avtomatik bo'lganda (`User.dailyLimit = null`)
 * ko'rsatkich maxraji ham shu ro'yxatning soni bo'ladi.
 */
export function dailyLeadWhere(now: Date) {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  return {
    assignedToId: { not: null },
    stage: { notIn: [...NO_CONTACT_STAGES] },
    status: { not: "INACTIVE" },
    OR: [
      {
        stage: { in: [...ACTIVE_STAGES] },
        OR: [
          { pendingStage: { not: null } },
          { nextContactDate: null },
          { nextContactDate: { lte: todayEnd } },
        ],
      },
      { status: "ACTIVE", nextPaymentDate: { lt: todayStart } },
    ],
  };
}

export type OperatorStat = {
  id: string;
  name: string;
  dayShift: boolean;
  assigned: number;
  dailyLimit: number | null; // qat'iy kvota; null = avtomatik
  // Kunlik lid jarayoni (tablo asosiy ko'rsatkichi):
  target: number; // bugungi lidlar (biriktirilgan kunlik ro'yxat) — maxraj
  todayProcessed: number; // ishlangan lidlar (bugun natija yozilgan distinct mijoz) — surat
  todayTalkedClients: number; // shulardan gaplashilgan distinct mijoz
  breakdown: Breakdown[]; // holatlar bo'yicha (distinct mijoz, oxirgi natija) — hover uchun
  // "today*" — tanlangan smena oynasidagi ko'rsatkichlar (smenaga qat'iy scope qilingan)
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
  shift: Shift; // ushbu ma'lumot qaysi smena oynasi uchun hisoblangan
  shiftStart: string;
  shiftEnd: string;
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
export async function getAnalytics(shift?: Shift): Promise<Analytics> {
  const now = new Date();
  const activeShift = shift ?? currentShift(now);
  const { start: shiftStart, end: shiftEnd } = shiftRange(activeShift, now);
  let weekStart = startOfWeek(now, { weekStartsOn: 1 }); // dushanba
  let monthStart = startOfMonth(now);
  let effShiftStart = shiftStart;

  // Tablo hisob chegarasi (statsResetAt) — belgilangan bo'lsa, undan oldingi
  // CallLog'lar hisobga OLINMAYDI (o'chirilmaydi — jurnal to'liq qoladi). Shunda
  // "oldingi natijalar" 0 bo'ladi, bugungisi saqlanadi.
  const statsFloor = await getStatsResetAt();
  if (statsFloor) {
    if (weekStart < statsFloor) weekStart = statsFloor;
    if (monthStart < statsFloor) monthStart = statsFloor;
    if (effShiftStart < statsFloor) effShiftStart = statsFloor;
  }

  // Loglar barcha oynalarni (smena/hafta/oy) qamrashi uchun — eng erta boshidan.
  const logsSince = new Date(
    Math.min(effShiftStart.getTime(), weekStart.getTime(), monthStart.getTime()),
  );

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [operators, assignedGroups, statusGroups, stageGroups, total, logs, dailyLeads] =
    await Promise.all([
      db.user.findMany({
        where: { role: "OPERATOR", isActive: true },
        select: { id: true, name: true, dailyLimit: true, shift: true },
        orderBy: { name: "asc" },
      }),
      db.client.groupBy({ by: ["assignedToId"], _count: true }),
      db.client.groupBy({ by: ["status"], _count: true }),
      db.client.groupBy({ by: ["stage"], _count: true }),
      db.client.count(),
      db.callLog.findMany({
        where: { calledAt: { gte: logsSince } },
        select: { operatorId: true, clientId: true, result: true, calledAt: true },
      }),
      // Operatorlarning BUGUNGI lid ro'yxati (maxraj) — /lidlar bilan bir xil mezon:
      // faol bosqichdagi muddati kelganlar + bugun ishlangan (pendingStage) + qarzdorlar.
      db.client.findMany({
        where: dailyLeadWhere(now),
        select: { id: true, assignedToId: true },
      }),
    ]);

  const assignedMap = new Map<string, number>();
  let unassigned = 0;
  for (const g of assignedGroups) {
    if (g.assignedToId) assignedMap.set(g.assignedToId, g._count);
    else unassigned = g._count;
  }
  const assigned = total - unassigned;

  // Bugungi lid ro'yxati (maxraj) — operator bo'yicha mijoz to'plami
  const dailySet = new Map<string, Set<string>>();
  for (const c of dailyLeads) {
    if (!c.assignedToId) continue;
    let s = dailySet.get(c.assignedToId);
    if (!s) { s = new Set(); dailySet.set(c.assignedToId, s); }
    s.add(c.id);
  }

  // Operator bo'yicha qo'ng'iroqlarni davr kesimida yig'ish (hafta/oy — log soni)
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

  // Bugungi (smena oynasi) DISTINCT mijoz kesimlari:
  const processedSet = new Map<string, Set<string>>(); // ishlangan (har qanday natija)
  const talkedSet = new Map<string, Set<string>>(); // shulardan gaplashilgan
  const latestResult = new Map<string, Map<string, { at: Date; result: string }>>(); // mijoz oxirgi natijasi

  for (const l of logs) {
    // "Gaplashildi" — operator mijozga haqiqatan yetgan natija (ko'tarmadi/o'chiq/band emas)
    const talked = TALKED_RESULTS.includes(l.result);
    // Oynalar statsFloor bilan qirqilgan (weekStart/monthStart/effShiftStart).
    const inMonth = l.calledAt >= monthStart;
    const inWeek = l.calledAt >= weekStart;
    // "today" — tanlangan smena oynasi: [effShiftStart, shiftEnd)
    const inToday = l.calledAt >= effShiftStart && l.calledAt < shiftEnd;

    if (inMonth) { totals.monthCalls++; if (talked) totals.monthTalked++; }
    if (inWeek) { totals.weekCalls++; if (talked) totals.weekTalked++; }
    if (inToday) { totals.todayCalls++; if (talked) totals.todayTalked++; }

    if (!l.operatorId) continue;
    let a = byOp.get(l.operatorId);
    if (!a) { a = blank(); byOp.set(l.operatorId, a); }
    if (inMonth) { a.monthCalls++; if (talked) a.monthTalked++; }
    if (inWeek) { a.weekCalls++; if (talked) a.weekTalked++; }
    if (inToday) {
      a.todayCalls++;
      if (talked) a.todayTalked++;
      if (l.clientId) {
        // Ishlangan — bugun natija yozilgan distinct mijoz (ko'tarmadi ham kiradi)
        let ps = processedSet.get(l.operatorId);
        if (!ps) { ps = new Set(); processedSet.set(l.operatorId, ps); }
        ps.add(l.clientId);
        if (talked) {
          let ts = talkedSet.get(l.operatorId);
          if (!ts) { ts = new Set(); talkedSet.set(l.operatorId, ts); }
          ts.add(l.clientId);
        }
        // Mijozning eng so'nggi bugungi natijasi (holat breakdown uchun)
        let lr = latestResult.get(l.operatorId);
        if (!lr) { lr = new Map(); latestResult.set(l.operatorId, lr); }
        const prev = lr.get(l.clientId);
        if (!prev || l.calledAt >= prev.at) lr.set(l.clientId, { at: l.calledAt, result: l.result });
      }
    }
  }

  const operatorStats: OperatorStat[] = operators.map((o) => {
    const a = byOp.get(o.id) ?? blank();
    const proc = processedSet.get(o.id) ?? new Set<string>();
    const talk = talkedSet.get(o.id) ?? new Set<string>();
    // Maxraj = bugungi lid ro'yxati ∪ bugun ishlangan (ro'yxatdan chiqqan REFUSED ham sanaladi)
    const targetSet = new Set<string>(dailySet.get(o.id) ?? []);
    for (const id of proc) targetSet.add(id);

    // Holat breakdown — distinct mijoz, oxirgi natija bo'yicha
    const tally = new Map<string, number>();
    const lr = latestResult.get(o.id);
    if (lr) for (const { result } of lr.values()) tally.set(result, (tally.get(result) ?? 0) + 1);
    const breakdown: Breakdown[] = [...tally.entries()]
      .map(([key, count]) => ({ key, label: callResultLabel(key), count }))
      .sort((x, y) => y.count - x.count);

    return {
      id: o.id,
      name: o.name,
      dayShift: o.shift !== "NIGHT",
      assigned: assignedMap.get(o.id) ?? 0,
      dailyLimit: o.dailyLimit,
      target: targetSet.size,
      todayProcessed: proc.size,
      todayTalkedClients: talk.size,
      breakdown,
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
    shift: activeShift,
    shiftStart: shiftStart.toISOString(),
    shiftEnd: shiftEnd.toISOString(),
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
  target: number; // kunlik kvota (User.dailyLimit)
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

  const [user, assigned, logs, dueToday] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, dailyLimit: true },
    }),
    db.client.count({ where: { assignedToId: userId } }),
    db.callLog.findMany({
      where: { operatorId: userId, calledAt: { gte: todayStart } },
      select: { result: true },
    }),
    db.client.count({ where: { ...dailyLeadWhere(now), assignedToId: userId } }),
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
    // Kvota avtomatik bo'lsa maxraj = bugun berilgan lidlar soni.
    target: user?.dailyLimit ?? dueToday,
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

  const [operators, todayLogs, lastLogs, dueGroups] = await Promise.all([
    db.user.findMany({
      where: { role: "OPERATOR", isActive: true },
      select: { id: true, name: true, dailyLimit: true },
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
    db.client.groupBy({ by: ["assignedToId"], where: dailyLeadWhere(now), _count: true }),
  ]);
  const dueByOp = new Map<string, number>();
  for (const g of dueGroups) if (g.assignedToId) dueByOp.set(g.assignedToId, g._count);

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
      target: o.dailyLimit ?? (dueByOp.get(o.id) ?? 0),
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

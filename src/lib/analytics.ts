import { addDays, endOfDay, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { db } from "@/lib/db";
import {
  ACTIVE_STAGES,
  CLIENT_STATUS,
  LEAD_STAGE,
  TALKED_RESULTS,
  callResultLabel,
  clientStatusLabel,
  leadStageLabel,
} from "@/lib/constants";

// --- Smena (shift) oynalari ---
// Kunduzgi: bugun 09:00 → 18:00. Kechki: 18:00 → ertasi 09:00 (yarim tunni kesib o'tadi).
export type Shift = "DAY" | "NIGHT";

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 18;

/** `base` sanasining aynan shu kunidagi soatni (00 daqiqa) qaytaradi. */
function atHour(base: Date, hour: number): Date {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Berilgan vaqtdagi joriy smena: 09:00–18:00 oralig'i — kunduzgi, aks holda kechki. */
export function currentShift(now: Date): Shift {
  const h = now.getHours();
  return h >= DAY_START_HOUR && h < DAY_END_HOUR ? "DAY" : "NIGHT";
}

/**
 * Smenaning [start, end) vaqt chegarasi. Kechki smena yarim tunni xavfsiz kesib o'tadi:
 * - agar hozir ertalab (00:00–09:00) bo'lsa — kechki smena kecha 18:00 dan bugun 09:00 gacha;
 * - aks holda (kunduzi/kechqurun) — bugun 18:00 dan ertaga 09:00 gacha.
 */
export function shiftRange(shift: Shift, now: Date): { start: Date; end: Date } {
  const nine = atHour(now, DAY_START_HOUR);
  const eighteen = atHour(now, DAY_END_HOUR);
  if (shift === "DAY") return { start: nine, end: eighteen };
  // NIGHT — yarim tunni kesib o'tadi
  if (now < nine) {
    return { start: atHour(addDays(now, -1), DAY_END_HOUR), end: nine };
  }
  return { start: eighteen, end: atHour(addDays(now, 1), DAY_START_HOUR) };
}

export type OperatorStat = {
  id: string;
  name: string;
  dayShift: boolean;
  assigned: number;
  dailyLimit: number; // kunlik biriktirish kvotasi (tahrirlanadi)
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
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // dushanba
  const monthStart = startOfMonth(now);
  // Loglar barcha oynalarni (smena/hafta/oy) qamrashi uchun — eng erta boshidan.
  // (Oy boshida hafta boshi oy boshidan oldin bo'lishi mumkin — shunda weekTalked
  //  kam sanalmasligi uchun weekStart ham hisobga olinadi.)
  const logsSince = new Date(
    Math.min(shiftStart.getTime(), weekStart.getTime(), monthStart.getTime()),
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
        where: {
          assignedToId: { not: null },
          stage: { not: "REFUSED" },
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
        },
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
    const inWeek = l.calledAt >= weekStart;
    // "today" — tanlangan smena oynasi: [shiftStart, shiftEnd)
    const inToday = l.calledAt >= shiftStart && l.calledAt < shiftEnd;

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

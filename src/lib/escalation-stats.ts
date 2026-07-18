// Eskalatsiya statistikasi — boshliq/admin uchun /eskalatsiya sahifasidagi
// ixcham panel. Faol yuk, SLA buzilishi va (oxirgi 30 kun) yakunlash tezligini
// hamda usta reytingini beradi. Hal qilish vaqti CallLog vaqtlaridan hisoblanadi
// (biriktirilgan → bajarilgan), chunki `escalatedAt` yakunlanganda tozalanadi.

import { db } from "./db";
import { slaThreshold } from "./sla";
import { ESCALATION_STAGES } from "./escalation";

const DAY_MS = 24 * 60 * 60 * 1000;
const STATS_WINDOW_DAYS = 30;

export type UstaRank = {
  ustaId: string;
  name: string;
  done: number; // oxirgi 30 kunda yakunlangan soni
  avgHours: number | null; // biriktirilgan→bajarilgan o'rtacha (soat)
};

export type EscalationStats = {
  activeTotal: number; // navbatda + ustada
  overdue: number; // 3 kundan oshgan (faol)
  overduePct: number; // 0..100
  resolvedLast30: number;
  avgResolveHours: number | null; // oxirgi 30 kun yakunlanganlar bo'yicha
  ustaRanking: UstaRank[]; // eng ko'p yakunlagan 5 usta
};

/** /eskalatsiya paneli uchun statistika (faqat boshliq/admin ko'radi). */
export async function getEscalationStats(now: Date = new Date()): Promise<EscalationStats> {
  const threshold = slaThreshold(now);
  const since = new Date(now.getTime() - STATS_WINDOW_DAYS * DAY_MS);
  const activeWhere = { stage: { in: [...ESCALATION_STAGES] } };

  const [activeTotal, overdue, resolved] = await Promise.all([
    db.client.count({ where: activeWhere }),
    db.client.count({
      where: {
        ...activeWhere,
        // /eskalatsiya sahifasidagi isOverdue bilan bir xil: escalatedAt (yoki updatedAt)
        OR: [
          { escalatedAt: { lt: threshold } },
          { escalatedAt: null, updatedAt: { lt: threshold } },
        ],
      },
    }),
    db.client.findMany({
      where: {
        stage: "RESOLVED",
        ustaStatus: "DONE",
        updatedAt: { gte: since },
        assignedUstaId: { not: null },
      },
      select: {
        assignedUstaId: true,
        assignedUsta: { select: { name: true } },
        callLogs: {
          where: { result: { in: ["ASSIGNED", "DONE"] } },
          select: { calledAt: true, result: true },
        },
      },
    }),
  ]);

  type Agg = { name: string; done: number; totalHours: number; timed: number };
  const byUsta = new Map<string, Agg>();
  let sumHours = 0;
  let timedCount = 0;

  for (const c of resolved) {
    if (!c.assignedUstaId) continue;
    const assigned = c.callLogs
      .filter((l) => l.result === "ASSIGNED")
      .map((l) => l.calledAt.getTime());
    const done = c.callLogs
      .filter((l) => l.result === "DONE")
      .map((l) => l.calledAt.getTime());
    const assignedAt = assigned.length ? Math.min(...assigned) : null;
    const doneAt = done.length ? Math.max(...done) : null;

    const agg =
      byUsta.get(c.assignedUstaId) ??
      { name: c.assignedUsta?.name ?? "—", done: 0, totalHours: 0, timed: 0 };
    agg.done += 1;

    if (assignedAt != null && doneAt != null && doneAt > assignedAt) {
      const hours = (doneAt - assignedAt) / (60 * 60 * 1000);
      sumHours += hours;
      timedCount += 1;
      agg.totalHours += hours;
      agg.timed += 1;
    }
    byUsta.set(c.assignedUstaId, agg);
  }

  const ustaRanking: UstaRank[] = [...byUsta.entries()]
    .map(([ustaId, a]) => ({
      ustaId,
      name: a.name,
      done: a.done,
      avgHours: a.timed ? a.totalHours / a.timed : null,
    }))
    .sort((a, b) => b.done - a.done)
    .slice(0, 5);

  return {
    activeTotal,
    overdue,
    overduePct: activeTotal ? Math.round((overdue / activeTotal) * 100) : 0,
    resolvedLast30: resolved.length,
    avgResolveHours: timedCount ? sumHours / timedCount : null,
    ustaRanking,
  };
}

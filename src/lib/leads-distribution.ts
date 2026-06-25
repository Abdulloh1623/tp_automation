// Kunlik random taqsimot yadrosi (auth'siz) — server action ham, worker (cron) ham ishlatadi.
import { endOfDay } from "date-fns";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ACTIVE_STAGES, LEAD_LIMITS } from "@/lib/constants";

export type DistributeResult = { assigned: number; operators: number; error?: string };

/**
 * Muddati kelgan faol lidlarni faol operatorlarga RANDOM ulashadi (har operatorga
 * `LEAD_LIMITS.daily` gacha). Doimiy biriktirish emas — har kuni qayta chaqiriladi.
 */
export async function distributeLeadsCore(): Promise<DistributeResult> {
  const operators = await db.user.findMany({
    where: { role: "OPERATOR", isActive: true },
    select: { id: true },
  });
  if (operators.length === 0) return { assigned: 0, operators: 0, error: "Faol operator yo'q" };

  const pool = await db.client.findMany({
    where: {
      status: "ACTIVE",
      stage: { in: ACTIVE_STAGES as unknown as string[] },
      OR: [{ nextContactDate: { lte: endOfDay(new Date()) } }, { nextContactDate: null }],
    },
    select: { id: true },
  });

  // Fisher–Yates
  const ids = pool.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  const capacity = operators.length * LEAD_LIMITS.daily;
  const selected = ids.slice(0, capacity);
  const overflow = ids.slice(capacity);

  const buckets = new Map<string, string[]>(operators.map((o) => [o.id, []]));
  selected.forEach((id, i) => buckets.get(operators[i % operators.length].id)!.push(id));

  let assigned = 0;
  for (const [opId, list] of buckets) {
    if (list.length === 0) continue;
    const r = await db.client.updateMany({ where: { id: { in: list } }, data: { assignedToId: opId } });
    assigned += r.count;
  }
  if (overflow.length) {
    await db.client.updateMany({ where: { id: { in: overflow } }, data: { assignedToId: null } });
  }

  await logAudit("Lidlar kunlik random taqsimlandi", {
    entity: "Client",
    detail: `${assigned} mijoz → ${operators.length} operator (limit ${LEAD_LIMITS.daily}/op)`,
  });
  return { assigned, operators: operators.length };
}

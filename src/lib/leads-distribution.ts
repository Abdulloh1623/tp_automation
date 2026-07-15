// Kunlik random taqsimot yadrosi (auth'siz) — server action ham, worker (cron) ham ishlatadi.
import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ACTIVE_STAGES, LEAD_LIMITS, NO_CONTACT_STAGES } from "@/lib/constants";
import { splitRoundRobin } from "@/lib/distribute-util";

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

  const now = new Date();
  const pool = await db.client.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        // Kunlik ish: muddati kelgan faol bosqichdagi lidlar
        {
          stage: { in: ACTIVE_STAGES as unknown as string[] },
          OR: [{ nextContactDate: { lte: endOfDay(now) } }, { nextContactDate: null }],
        },
        // Qarzdorlar — bosqichidan qat'i nazar, LEKIN otkaz/o'chirilganlar EMAS
        // (ular bilan qayta aloqaga chiqilmaydi — qarzi bo'lsa ham).
        {
          nextPaymentDate: { lt: startOfDay(now) },
          stage: { notIn: NO_CONTACT_STAGES as unknown as string[] },
        },
      ],
    },
    select: { id: true, nextPaymentDate: true },
  });

  // Fisher–Yates
  const ids = pool.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  // Qarzdorlar navbat boshiga — operator limiti to'lsa ham ular albatta taqsimlanadi
  const todayStart = startOfDay(now).getTime();
  const debtorIds = new Set(
    pool
      .filter((c) => c.nextPaymentDate != null && c.nextPaymentDate.getTime() < todayStart)
      .map((c) => c.id),
  );
  ids.sort((a, b) => Number(debtorIds.has(b)) - Number(debtorIds.has(a)));

  const { byOp: buckets, overflow } = splitRoundRobin(
    ids,
    operators.map((o) => o.id),
    LEAD_LIMITS.daily,
  );

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

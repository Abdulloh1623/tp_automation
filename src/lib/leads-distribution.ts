// Kunlik taqsimot yadrosi (auth'siz) — server action ham, worker (cron) ham ishlatadi.
import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  ACTIVE_STAGES,
  LEAD_LIMITS,
  NO_CONTACT_STAGES,
  leadProfileLabel,
  profileOrder,
  type LeadProfileId,
  type LeadSegment,
} from "@/lib/constants";
import { allocateByProfile, splitByCapacity } from "@/lib/distribute-util";
import { classifyLead, isFloorLead, overdueDays } from "@/lib/lead-segments";
import { getActiveLeadProfile } from "@/lib/settings";
import { startOfTzDay } from "@/lib/tz";

export type DistributeResult = {
  assigned: number;
  operators: number;
  /** Egasida qolgan (bugun allaqachon ishlangan) lidlar soni. */
  kept?: number;
  /** Majburiy pol bo'yicha kiritilganlar soni. */
  floor?: number;
  profile?: LeadProfileId;
  profileLabel?: string;
  todayOnly?: boolean;
  error?: string;
};

/** Fisher–Yates — segment ichida navbat tasodifiy bo'lsin (operatorlar teng sharoitda). */
function shuffle(ids: string[]): void {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
}

/**
 * Muddati kelgan faol lidlarni faol operatorlarga ulashadi. Doimiy biriktirish
 * emas — har kuni qayta chaqiriladi.
 *
 * Tartib admin tanlagan KUNLIK FOKUS profili bilan belgilanadi: hovuz
 * segmentlarga bo'linadi va har operatorning kunlik kvotasi profil ulushlari
 * bo'yicha to'ldiriladi (majburiy pol — bugunga va'da berilganlar va eski
 * qarzdorlar — profildan qat'i nazar kiradi).
 *
 * Bugun allaqachon ishlangan lid (natija yozilgan yoki qo'ng'iroq qilingan)
 * EGASIDA qoladi — kun o'rtasida fokus almashsa ham operatorning ishi buzilmaydi.
 */
export async function distributeLeadsCore(): Promise<DistributeResult> {
  const operators = await db.user.findMany({
    where: { role: "OPERATOR", isActive: true },
    select: { id: true },
  });
  if (operators.length === 0) return { assigned: 0, operators: 0, error: "Faol operator yo'q" };

  const now = new Date();
  const active = await getActiveLeadProfile(now);
  const order = profileOrder(active.id);

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
    select: {
      id: true,
      assignedToId: true,
      pendingStage: true,
      stage: true,
      createdAt: true,
      nextPaymentDate: true,
      nextContactDate: true,
      lastContactedAt: true,
      missedCallCount: true,
      monthlyAmount: true,
      currency: true,
    },
  });

  // Bugun tegilgan lidlar — qayta taqsimlanmaydi, egasida qoladi va uning
  // kunlik kvotasidan hisoblanadi.
  const touchedRows = await db.callLog.findMany({
    where: { calledAt: { gte: startOfTzDay(0) } },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  const touched = new Set(touchedRows.map((r) => r.clientId));

  const locked = new Map<string, number>();
  const free: typeof pool = [];
  for (const c of pool) {
    if (c.assignedToId && (c.pendingStage != null || touched.has(c.id))) {
      locked.set(c.assignedToId, (locked.get(c.assignedToId) ?? 0) + 1);
      continue;
    }
    free.push(c);
  }

  const slots = operators.map((o) => ({
    id: o.id,
    cap: Math.max(0, LEAD_LIMITS.daily - (locked.get(o.id) ?? 0)),
  }));
  const capacity = slots.reduce((sum, o) => sum + o.cap, 0);

  // Segmentlash — profil tartibida (birinchi mos segment yutadi).
  const buckets = new Map<LeadSegment, string[]>();
  for (const c of free) {
    const seg = classifyLead(c, order, now);
    const list = buckets.get(seg);
    if (list) list.push(c.id);
    else buckets.set(seg, [c.id]);
  }
  for (const list of buckets.values()) shuffle(list);

  // Majburiy pol: avval bugunga va'da berilganlar (mijozga sana aytilgan),
  // keyin eng eski qarzdorlar.
  const floorRows = free.filter((c) => isFloorLead(c, now));
  floorRows.sort((a, b) => {
    const pa = a.nextContactDate ? 1 : 0;
    const pb = b.nextContactDate ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return overdueDays(b, now) - overdueDays(a, now);
  });

  const { picked, leftover } = allocateByProfile(
    buckets,
    order,
    floorRows.map((c) => c.id),
    capacity,
  );
  const { byOp, overflow } = splitByCapacity(picked, slots);

  let assigned = 0;
  for (const [opId, list] of byOp) {
    if (list.length === 0) continue;
    const r = await db.client.updateMany({ where: { id: { in: list } }, data: { assignedToId: opId } });
    assigned += r.count;
  }
  const unassigned = [...leftover, ...overflow];
  if (unassigned.length) {
    await db.client.updateMany({ where: { id: { in: unassigned } }, data: { assignedToId: null } });
  }

  const kept = [...locked.values()].reduce((s, n) => s + n, 0);
  const label = leadProfileLabel(active.id);
  await logAudit("Lidlar kunlik taqsimlandi", {
    entity: "Client",
    detail:
      `${assigned} mijoz → ${operators.length} operator (limit ${LEAD_LIMITS.daily}/op) · ` +
      `fokus: ${label}${active.todayOnly ? " (faqat bugunga)" : ""} · ` +
      `majburiy: ${floorRows.length} · egasida qoldi: ${kept} · navbatda: ${unassigned.length}`,
  });
  return {
    assigned,
    operators: operators.length,
    kept,
    floor: floorRows.length,
    profile: active.id,
    profileLabel: label,
    todayOnly: active.todayOnly,
  };
}

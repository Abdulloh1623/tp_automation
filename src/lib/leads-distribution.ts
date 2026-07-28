// Kunlik taqsimot yadrosi (auth'siz) — server action ham, worker (cron) ham ishlatadi.
import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  ACTIVE_STAGES,
  NO_CONTACT_STAGES,
  USER_SHIFT,
  leadProfileLabel,
  profileOrder,
  type LeadProfileId,
  type LeadSegment,
  type UserShift,
} from "@/lib/constants";
import { allocateByProfile, splitByCapacity } from "@/lib/distribute-util";
import { classifyLead, isFloorLead, overdueDays } from "@/lib/lead-segments";
import { getActiveLeadProfile } from "@/lib/settings";
import { currentShift } from "@/lib/shift";
import { startOfTzDay } from "@/lib/tz";

export type DistributeResult = {
  assigned: number;
  operators: number;
  /** Egasida qolgan (bugun allaqachon ishlangan) lidlar soni. */
  kept?: number;
  /** Majburiy pol bo'yicha kiritilganlar soni. */
  floor?: number;
  /** Tugagan smenadan bo'shatib olingan (tegilmagan) lidlar soni. */
  released?: number;
  /** Bugungi qo'shimcha lid grantlari (bot orqali berilgan) jami. */
  granted?: number;
  /** Umumiy bo'sh sig'im — operatorlar kvotasi minus band joylar. */
  capacity?: number;
  /** Qaysi smena uchun taqsimlandi (bo'sh — barcha operatorlarga). */
  shift?: UserShift;
  shiftLabel?: string;
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
 *
 * `shift` berilsa — faqat o'sha smenadagi operatorlarga taqsimlanadi. Bunda
 * BOSHQA smenaning lidlari tegilmaydi, LEKIN o'sha smena allaqachon tugagan
 * bo'lsa, uning ishlanmagan lidlari bo'shatilib joriy smenaga o'tadi (kunduzgi
 * smena ulgurmagan lid kechqurun yana navbatga tushadi). `shift` berilmasa —
 * eski xulq: barcha faol operatorlar.
 */
export async function distributeLeadsCore(shift?: UserShift): Promise<DistributeResult> {
  const operators = await db.user.findMany({
    where: { role: "OPERATOR", isActive: true, ...(shift ? { shift } : {}) },
    select: { id: true, dailyLimit: true },
  });
  if (operators.length === 0) {
    return {
      assigned: 0,
      operators: 0,
      shift,
      error: shift
        ? `${USER_SHIFT[shift]} smenasida faol operator yo'q`
        : "Faol operator yo'q",
    };
  }

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

  // Kim qaysi smenada — boshqa smenaning lidiga tegmaslik uchun.
  const other: UserShift | null = shift ? (shift === "DAY" ? "NIGHT" : "DAY") : null;
  const otherEnded = other ? currentShift(now) !== other : false;
  const shiftOf = new Map<string, string>();
  if (other) {
    const all = await db.user.findMany({
      where: { role: "OPERATOR" },
      select: { id: true, shift: true },
    });
    for (const o of all) shiftOf.set(o.id, o.shift);
  }

  const locked = new Map<string, number>();
  const free: typeof pool = [];
  let released = 0;
  for (const c of pool) {
    // Bugun ishlangan lid — har doim egasida qoladi.
    if (c.assignedToId && (c.pendingStage != null || touched.has(c.id))) {
      locked.set(c.assignedToId, (locked.get(c.assignedToId) ?? 0) + 1);
      continue;
    }
    if (shift && c.assignedToId && shiftOf.get(c.assignedToId) === other) {
      // Boshqa smenaning ishlanmagan lidi: o'sha smena hali ishlayotgan bo'lsa
      // tegmaymiz; tugagan bo'lsa — bo'shatib joriy smenaga beramiz.
      if (!otherEnded) continue;
      released++;
    }
    free.push(c);
  }

  // Bugungi qo'shimcha lidlar — boshliq botdan "+N lid" berganda yoziladi
  // (`DailyLeadGrant`). Ilgari bu jadval hech kim tomonidan o'qilmasdi, ya'ni
  // tugma tasdiq berardi-yu, natija bermasdi.
  const grantRows = await db.dailyLeadGrant.findMany({
    where: { date: startOfTzDay(0), userId: { in: operators.map((o) => o.id) } },
    select: { userId: true, extraCount: true },
  });
  const grants = new Map(grantRows.map((g) => [g.userId, g.extraCount]));
  const granted = grantRows.reduce((s, g) => s + g.extraCount, 0);

  // Kvota har operatorning O'ZINIKI (`User.dailyLimit`) + bugungi qo'shimcha,
  // ishlangan lidlar esa shu kvotani band qiladi.
  const slots = operators.map((o) => ({
    id: o.id,
    cap: Math.max(0, o.dailyLimit + (grants.get(o.id) ?? 0) - (locked.get(o.id) ?? 0)),
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
  const shiftLabel = shift ? USER_SHIFT[shift] : undefined;
  await logAudit("Lidlar kunlik taqsimlandi", {
    entity: "Client",
    detail:
      `${assigned} mijoz → ${operators.length} operator (sig'im ${capacity})` +
      (shiftLabel ? ` · smena: ${shiftLabel}` : "") +
      ` · fokus: ${label}${active.todayOnly ? " (faqat bugunga)" : ""} · ` +
      `majburiy: ${floorRows.length} · egasida qoldi: ${kept}` +
      (granted ? ` · qo'shimcha grant: +${granted}` : "") +
      (released ? ` · tugagan smenadan olindi: ${released}` : "") +
      ` · navbatda: ${unassigned.length}`,
  });
  return {
    assigned,
    operators: operators.length,
    kept,
    floor: floorRows.length,
    released,
    granted,
    capacity,
    shift,
    shiftLabel,
    profile: active.id,
    profileLabel: label,
    todayOnly: active.todayOnly,
  };
}

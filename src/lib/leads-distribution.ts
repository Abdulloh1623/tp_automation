// Kunlik taqsimot yadrosi (auth'siz) — server action ham, worker (cron) ham ishlatadi.
import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  ACTIVE_STAGES,
  DEFAULT_DUTY_ROSTER,
  NO_CONTACT_STAGES,
  OFF_BOARD_STAGES,
  USER_SHIFT,
  focusLabel,
  focusOrder,
  type LeadSegment,
  type UserShift,
} from "@/lib/constants";
import { allocateByProfile, splitByCapacity } from "@/lib/distribute-util";
import { classifyLead, isFloorLead, overdueDays } from "@/lib/lead-segments";
import { autoDailyLimit } from "@/lib/recall-rules";
import { getActiveLeadProfile, getRecallSettings } from "@/lib/settings";
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
  /** Avtomatik hisoblangan kunlik kvota (dailyLimit qo'yilmaganlar uchun). */
  autoLimit?: number;
  /** Ro'yxat kam bo'lgani uchun oldinga tortilgan (muddati kelmagan) lidlar. */
  pulled?: number;
  /** Qaysi smena uchun taqsimlandi (bo'sh — barcha operatorlarga). */
  shift?: UserShift;
  shiftLabel?: string;
  profileLabel?: string;
  todayOnly?: boolean;
  error?: string;
  /** Admin jadval belgilamagani uchun DEFAULT_DUTY_ROSTER (zaxira brigada) ishlatildi. */
  usedFallbackRoster?: boolean;
};

/** Hovuz uchun kerakli ustunlar — segmentlash va saralash shularga tayanadi. */
const POOL_SELECT = {
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
} as const;

/** Fisher–Yates — segment ichida navbat tasodifiy bo'lsin (operatorlar teng sharoitda). */
function shuffle(ids: string[]): void {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
}

type DutyRow = { userId: string; shift: string };

/**
 * Smena uchun `/ish-jadvali`da HECH KIM belgilanmagan bo'lsa, `DEFAULT_DUTY_ROSTER`
 * (zaxira brigada) bilan to'ldiradi — admin jadval kiritishni unutgan kun uchun
 * xavfsizlik to'ri, ish jadvali tizimining o'rnini bosmaydi (admin biror kishini
 * bo'lса ham belgilagan smena TEGILMAYDI). Faqat ANIQ smena bilan chaqirilganda
 * ishlaydi — bu aynan HAR KUNI 08:00/18:00 avtomatik (cron) taqsimot yo'li;
 * `shiftFilter` berilmasa (qo'lda "Qayta taqsimla", butun kunni qamraydigan
 * chaqiruv) hech narsa o'zgartirilmaydi — bu holat allaqachon ADMIN'ning
 * ko'z oldida bajariladigan aniq amal, xato xabari yetarli.
 */
async function fillMissingWithDefaultRoster(
  dutyRows: DutyRow[],
  shiftFilter?: UserShift,
): Promise<{ rows: DutyRow[]; usedFallback: boolean }> {
  if (!shiftFilter || dutyRows.some((d) => d.shift === shiftFilter)) {
    return { rows: dutyRows, usedFallback: false };
  }

  const wanted = DEFAULT_DUTY_ROSTER[shiftFilter].map((name) => ({ name, shift: shiftFilter }));
  const candidates = await db.user.findMany({
    where: {
      role: "OPERATOR",
      isActive: true,
      OR: wanted.map((w) => ({ name: { startsWith: w.name, mode: "insensitive" as const } })),
    },
    select: { id: true, name: true },
  });

  const extra: DutyRow[] = [];
  for (const w of wanted) {
    const match = candidates.find((c) => c.name.toLowerCase().startsWith(w.name.toLowerCase()));
    if (match) extra.push({ userId: match.id, shift: w.shift });
  }
  return { rows: [...dutyRows, ...extra], usedFallback: extra.length > 0 };
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
 * KIM bugun ishlayotgani va qaysi smenada — endi avtomatik (User.shift) EMAS,
 * ADMIN kun oldin belgilagan kunlik jadvaldan (`DutyDay`, `/ish-jadvali`)
 * olinadi. `shift` berilsa — faqat o'sha smenaga tayinlanganlarga taqsimlanadi.
 * Bunda BOSHQA smenaning lidlari tegilmaydi, LEKIN o'sha smena allaqachon
 * tugagan bo'lsa, uning ishlanmagan lidlari bo'shatilib joriy smenaga o'tadi
 * (kunduzgi smena ulgurmagan lid kechqurun yana navbatga tushadi). `shift`
 * berilmasa — bugungi jadvaldagi BARCHA (ikkala smena) operatorlarga.
 */
export async function distributeLeadsCore(shift?: UserShift): Promise<DistributeResult> {
  // Bugungi jadval — bir marta o'qiladi: kimga taqsimlanishi (shift bo'yicha
  // filtrlanadi) va "boshqa smena kim edi" (shiftOf) shundan chiqadi.
  const dutyRowsRaw = await db.dutyDay.findMany({
    where: { date: startOfTzDay(0) },
    select: { userId: true, shift: true },
  });
  const { rows: dutyRows, usedFallback } = await fillMissingWithDefaultRoster(dutyRowsRaw, shift);
  const shiftOf = new Map(dutyRows.map((d) => [d.userId, d.shift as UserShift]));
  const rosterIds = shift ? dutyRows.filter((d) => d.shift === shift).map((d) => d.userId) : dutyRows.map((d) => d.userId);

  if (rosterIds.length === 0) {
    return {
      assigned: 0,
      operators: 0,
      shift,
      error: shift
        ? `${USER_SHIFT[shift]} smenasiga bugun hech kim tayinlanmagan — /ish-jadvali`
        : "Bugungi ish jadvali hali belgilanmagan — /ish-jadvali",
    };
  }

  const operators = await db.user.findMany({
    where: { role: "OPERATOR", isActive: true, id: { in: rosterIds } },
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
  const order = focusOrder(active.selection);
  const { policy } = await getRecallSettings();

  // Qarzdor bilan bugun gaplashilgan bo'lsa, ertaga qayta ko'rsatmaymiz —
  // aks holda qarzdorlar har kuni qaytib kelib butun ro'yxatni egallardi
  // (ularning kirishi `nextContactDate` ga bog'liq emas).
  const debtorSince = new Date(now.getTime() - policy.debtorCooldownDays * 86400000);

  const pool = await db.client.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        // Kunlik ish: muddati kelgan faol bosqichdagi lidlar
        {
          stage: { in: ACTIVE_STAGES as unknown as string[] },
          OR: [{ nextContactDate: { lte: endOfDay(now) } }, { nextContactDate: null }],
        },
        // Qarzdorlar — bosqichidan qat'i nazar, LEKIN otkaz/o'chirilgan/boshqa
        // jarayonga o'tganlar EMAS (ular bilan qayta aloqaga chiqilmaydi —
        // qarzi bo'lsa ham).
        {
          nextPaymentDate: { lt: startOfDay(now) },
          stage: { notIn: [...NO_CONTACT_STAGES, ...OFF_BOARD_STAGES] as unknown as string[] },
          OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: debtorSince } }],
        },
      ],
    },
    select: { ...POOL_SELECT },
  });

  // Bugun tegilgan lidlar — qayta taqsimlanmaydi, egasida qoladi va uning
  // kunlik kvotasidan hisoblanadi.
  const touchedRows = await db.callLog.findMany({
    where: { calledAt: { gte: startOfTzDay(0) } },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  const touched = new Set(touchedRows.map((r) => r.clientId));

  // Boshqa smenaning lidiga tegmaslik uchun — bugungi jadval yuqorida `shiftOf`
  // ga o'qilgan.
  const other: UserShift | null = shift ? (shift === "DAY" ? "NIGHT" : "DAY") : null;
  const otherEnded = other ? currentShift(now) !== other : false;

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

  // Kunlik kvota: `dailyLimit` qo'yilgan bo'lsa — o'sha, aks holda AVTOMATIK
  // (bugungi ro'yxat operatorlarga teng bo'linadi, siyosat chegaralari ichida).
  const auto = autoDailyLimit(free.length, operators.length, policy);
  const limitOf = (o: { dailyLimit: number | null }) => o.dailyLimit ?? auto;

  // Ro'yxat kam bo'lsa — muddati eng yaqin lidlarni oldinga tortamiz, operator
  // bo'sh o'tirmasin. Faqat AVTOMATIK rejimda ma'noga ega.
  const wanted = operators.reduce((s, o) => s + limitOf(o), 0);
  let pulled = 0;
  if (free.length < wanted) {
    const extra = await db.client.findMany({
      where: {
        status: "ACTIVE",
        stage: { in: ACTIVE_STAGES as unknown as string[] },
        nextContactDate: { gt: endOfDay(now) },
        id: { notIn: free.map((c) => c.id) },
      },
      orderBy: { nextContactDate: "asc" },
      take: wanted - free.length,
      select: { ...POOL_SELECT },
    });
    // Boshqa smenaning (hali ishlayotgan) lidini tortib olmaymiz.
    const usable = extra.filter(
      (c) => !(shift && c.assignedToId && shiftOf.get(c.assignedToId) === other && !otherEnded),
    );
    free.push(...usable);
    pulled = usable.length;
  }

  const slots = operators.map((o) => ({
    id: o.id,
    cap: Math.max(0, limitOf(o) + (grants.get(o.id) ?? 0) - (locked.get(o.id) ?? 0)),
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
  const label = focusLabel(active.selection);
  const shiftLabel = shift ? USER_SHIFT[shift] : undefined;
  await logAudit("Lidlar kunlik taqsimlandi", {
    entity: "Client",
    detail:
      `${assigned} mijoz → ${operators.length} operator (sig'im ${capacity})` +
      (shiftLabel ? ` · smena: ${shiftLabel}` : "") +
      ` · fokus: ${label}${active.todayOnly ? " (faqat bugunga)" : ""} · ` +
      `majburiy: ${floorRows.length} · egasida qoldi: ${kept}` +
      (granted ? ` · qo'shimcha grant: +${granted}` : "") +
      (pulled ? ` · oldinga tortildi: ${pulled}` : "") +
      ` · avto kvota: ${auto}` +
      (released ? ` · tugagan smenadan olindi: ${released}` : "") +
      ` · navbatda: ${unassigned.length}` +
      (usedFallback ? " · ⚠️ jadval belgilanmagan, zaxira brigada ishlatildi" : ""),
  });
  return {
    assigned,
    operators: operators.length,
    kept,
    floor: floorRows.length,
    released,
    granted,
    capacity,
    autoLimit: auto,
    pulled,
    shift,
    shiftLabel,
    profileLabel: label,
    todayOnly: active.todayOnly,
    usedFallbackRoster: usedFallback,
  };
}

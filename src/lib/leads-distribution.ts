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
import {
  allocateByProfile,
  buildRegionCoverage,
  splitByCapacity,
  splitPoolByRegionCoverage,
  weightedAutoLimit,
  type RegionCoverage,
} from "@/lib/distribute-util";
import { classifyLead, isFloorLead, overdueDays } from "@/lib/lead-segments";
import { autoDailyLimit } from "@/lib/recall-rules";
import {
  FALLBACK_AUTO_LIMIT_KEY,
  getActiveLeadProfile,
  getRecallSettings,
  getTodayDayAutoLimits,
  setTodayDayAutoLimits,
} from "@/lib/settings";
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
  /** Viloyat bo'yicha taqsimlash sozlamada yoqilganmi (`LoadPolicy.regionBasedDistribution`). */
  regionEnabled?: boolean;
  /** O'z viloyati orqali (operatorning `regions`iga to'g'ri kelib) biriktirilganlar soni. */
  regionAssigned?: number;
  /** Umumiy/fallback hovuzdan (viloyatsiz yoki hech kim qoplamagan viloyat) biriktirilganlar soni. */
  fallbackAssigned?: number;
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
  region: true,
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
    select: { id: true, dailyLimit: true, region: true, regions: true },
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
  // tugma tasdiq berardi-yu, natija bermasdi. Grant — umumiy/fallback
  // qatlamiga qo'shiladi (aniq bitta viloyatga bog'lab bo'lmaydi, chunki bot
  // "+N lid" so'raganda qaysi viloyatdan ekanini bilmaydi).
  const grantRows = await db.dailyLeadGrant.findMany({
    where: { date: startOfTzDay(0), userId: { in: operators.map((o) => o.id) } },
    select: { userId: true, extraCount: true },
  });
  const grants = new Map(grantRows.map((g) => [g.userId, g.extraCount]));
  const granted = grantRows.reduce((s, g) => s + g.extraCount, 0);

  // --- Viloyat qamrovi (LoadPolicy.regionBasedDistribution) ---
  //
  // Ikki qatlamli taqsimot:
  //   A) VILOYAT qatlami — bugun ishlayotgan operator o'z biriktirilgan
  //      viloyat(lar)idagi ("User.regions") mijozlarni oladi;
  //   B) UMUMIY/FALLBACK qatlami — viloyatsiz/notanish mijozlar VA hech kim
  //      (bugun) qoplamagan viloyat mijozlari — bularning barchasi eski
  //      global algoritm bilan barcha operatorlar orasida taqsimlanadi.
  //
  // Sozlama O'CHIQ bo'lsa (yoki hech bir operatorga hali viloyat
  // biriktirilmagan bo'lsa) — `coverage` bo'sh, demak HAMMASI fallback
  // qatlamiga tushadi va natija AYNAN eski (viloyatsiz) xatti-harakatga teng.
  const coverage: RegionCoverage = policy.regionBasedDistribution
    ? buildRegionCoverage(operators.map((o) => ({ id: o.id, region: o.region, regions: o.regions })))
    : new Map();
  const { byRegion, fallback: fallbackPoolInitial } = splitPoolByRegionCoverage(free, coverage);

  const isNight = (id: string) => shiftOf.get(id) === "NIGHT";
  // "NIGHT-yolg'iz" holatda (bugun kunduzgi hech kim yo'q shu chaqiruvda)
  // saqlangan kunduzgi bazaviy qiymatlarni o'qiymiz — DAY va NIGHT odatda
  // alohida cron chaqiruvida ishlaydi (bir-birining operatorini ko'rmaydi).
  const storedDayLimits = shift === "NIGHT" ? await getTodayDayAutoLimits(now) : null;
  const dayLimitsToStore: Record<string, number> = {};
  const discountFrac =
    Math.max(0, Math.min(100, policy.nightShiftDiscountPercent ?? 0)) / 100;
  const nightFromDay = (d: number) => Math.max(0, Math.round(d * (1 - discountFrac)));

  /** Bitta kontekst (bitta viloyat yoki fallback)ning kunduzgi/kechki avto kvotasi. */
  function contextAuto(
    key: string,
    poolSize: number,
    opIds: string[],
  ): { dayAuto: number; nightAuto: number } {
    const dayCount = opIds.filter((id) => !isNight(id)).length;
    const nightCount = opIds.length - dayCount;
    let dayAuto: number;
    if (shift === "NIGHT" && dayCount === 0) {
      dayAuto = storedDayLimits?.[key] ?? autoDailyLimit(poolSize, opIds.length, policy);
    } else {
      dayAuto = weightedAutoLimit(
        poolSize,
        dayCount,
        nightCount,
        policy.nightShiftDiscountPercent ?? 0,
        policy,
      ).dayAuto;
      if (shift === "DAY") dayLimitsToStore[key] = dayAuto;
    }
    return { dayAuto, nightAuto: nightFromDay(dayAuto) };
  }

  const regionAuto = new Map<string, { dayAuto: number; nightAuto: number }>();
  for (const [region, opIds] of coverage) {
    regionAuto.set(region, contextAuto(region, byRegion.get(region)?.length ?? 0, opIds));
  }
  const fallbackOpIds = operators.map((o) => o.id);
  const fallbackAuto = contextAuto(FALLBACK_AUTO_LIMIT_KEY, fallbackPoolInitial.length, fallbackOpIds);
  if (shift === "DAY") await setTodayDayAutoLimits(dayLimitsToStore, now);

  // Operatorning AVTOMATIK (dailyLimit=null) jami kvotasi — o'zi qoplagan har
  // viloyatning kvotasi + fallback ulushi yig'indisi. `dailyLimit` qo'yilgan
  // bo'lsa — bu YAGONA qat'iy jami chegara (viloyatlardan qat'i nazar).
  function autoTotal(opId: string): number {
    let total = isNight(opId) ? fallbackAuto.nightAuto : fallbackAuto.dayAuto;
    for (const [region, opIds] of coverage) {
      if (!opIds.includes(opId)) continue;
      const a = regionAuto.get(region)!;
      total += isNight(opId) ? a.nightAuto : a.dayAuto;
    }
    return total;
  }
  const limitOf = (o: { id: string; dailyLimit: number | null }) => o.dailyLimit ?? autoTotal(o.id);

  // Har operatorning bugungi QOLGAN sig'imi — ikkala qatlam ORASIDA
  // ULASHILADI (umumiy manba): viloyat qatlami avval iste'mol qiladi,
  // fallback qatlami esa qolganidan foydalanadi.
  const remaining = new Map<string, number>();
  for (const o of operators) {
    remaining.set(
      o.id,
      Math.max(0, limitOf(o) + (grants.get(o.id) ?? 0) - (locked.get(o.id) ?? 0)),
    );
  }
  const capacity = [...remaining.values()].reduce((s, n) => s + n, 0);

  const pulledIds = new Set(free.map((c) => c.id));
  let pulled = 0;
  const floorTotal = { count: 0 };
  const unassigned: string[] = [];
  const finalByOp = new Map<string, string[]>(operators.map((o) => [o.id, []]));
  const regionAssignedCount = new Map<string, number>();
  let fallbackAssigned = 0;

  /** Ro'yxat kam bo'lsa — muddati eng yaqin lidlarni oldinga tortadi (region=null — fallback filtri). */
  async function pullForwardExtra(
    region: string | null,
    need: number,
  ): Promise<typeof free> {
    if (need <= 0) return [];
    const regionWhere = region
      ? { region }
      : { OR: [{ region: null }, { region: { notIn: [...coverage.keys()] } }] };
    const extra = await db.client.findMany({
      where: {
        status: "ACTIVE",
        stage: { in: ACTIVE_STAGES as unknown as string[] },
        nextContactDate: { gt: endOfDay(now) },
        id: { notIn: [...pulledIds] },
        ...regionWhere,
      },
      orderBy: { nextContactDate: "asc" },
      take: need,
      select: { ...POOL_SELECT },
    });
    // Boshqa smenaning (hali ishlayotgan) lidini tortib olmaymiz.
    const usable = extra.filter(
      (c) => !(shift && c.assignedToId && shiftOf.get(c.assignedToId) === other && !otherEnded),
    );
    for (const c of usable) pulledIds.add(c.id);
    return usable;
  }

  /** Bitta guruh (viloyat yoki fallback)ni segmentlab, profil bo'yicha operatorlarga bo'ladi. */
  async function allocateGroup(
    poolRows: typeof free,
    opIds: string[],
    region: string | null,
  ): Promise<void> {
    const wanted = opIds.reduce((s, id) => s + (remaining.get(id) ?? 0), 0);
    let rows = poolRows;
    if (wanted > 0 && rows.length < wanted) {
      const extra = await pullForwardExtra(region, wanted - rows.length);
      rows = [...rows, ...extra];
      pulled += extra.length;
    }

    const buckets = new Map<LeadSegment, string[]>();
    for (const c of rows) {
      const seg = classifyLead(c, order, now);
      const list = buckets.get(seg);
      if (list) list.push(c.id);
      else buckets.set(seg, [c.id]);
    }
    for (const list of buckets.values()) shuffle(list);

    // Majburiy pol: avval bugunga va'da berilganlar (mijozga sana aytilgan),
    // keyin eng eski qarzdorlar.
    const floorRows = rows.filter((c) => isFloorLead(c, now));
    floorRows.sort((a, b) => {
      const pa = a.nextContactDate ? 1 : 0;
      const pb = b.nextContactDate ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return overdueDays(b, now) - overdueDays(a, now);
    });
    floorTotal.count += floorRows.length;

    const { picked, leftover } = allocateByProfile(
      buckets,
      order,
      floorRows.map((c) => c.id),
      wanted,
    );
    const slots = opIds.map((id) => ({ id, cap: remaining.get(id) ?? 0 }));
    const { byOp, overflow } = splitByCapacity(picked, slots);

    let assignedHere = 0;
    for (const [opId, ids] of byOp) {
      if (ids.length === 0) continue;
      finalByOp.get(opId)!.push(...ids);
      remaining.set(opId, (remaining.get(opId) ?? 0) - ids.length);
      assignedHere += ids.length;
    }
    if (region) regionAssignedCount.set(region, assignedHere);
    else fallbackAssigned = assignedHere;
    unassigned.push(...leftover, ...overflow);
  }

  // A qatlam — viloyatlar (tasodifiy tartibda, ko'p-viloyatli operatorning
  // umumiy sig'imi adolatli taqsimlansin uchun har chaqiruvda boshqa tartib).
  // HAMMA qoplangan viloyat ishlanadi — bugun hovuzi bo'sh bo'lsa ham (operator
  // sig'imi bo'sh qolmasin uchun o'z viloyatidan oldinga tortish sinaladi).
  const regionOrder = [...coverage.keys()];
  shuffle(regionOrder);
  for (const region of regionOrder) {
    const opIds = coverage.get(region)!;
    await allocateGroup(byRegion.get(region) ?? [], opIds, region);
  }

  // B qatlam — umumiy/fallback (viloyatsiz + qoplanmagan viloyat mijozlari),
  // barcha bugun ishlayotgan operatorlarning QOLGAN sig'imi orasida.
  await allocateGroup(fallbackPoolInitial, fallbackOpIds, null);

  let assigned = 0;
  for (const [opId, list] of finalByOp) {
    if (list.length === 0) continue;
    const r = await db.client.updateMany({ where: { id: { in: list } }, data: { assignedToId: opId } });
    assigned += r.count;
  }
  if (unassigned.length) {
    await db.client.updateMany({ where: { id: { in: unassigned } }, data: { assignedToId: null } });
  }

  const kept = [...locked.values()].reduce((s, n) => s + n, 0);
  const label = focusLabel(active.selection);
  const shiftLabel = shift ? USER_SHIFT[shift] : undefined;
  const regionEnabled = policy.regionBasedDistribution && coverage.size > 0;
  const regionSummary = [...regionAssignedCount.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([r, n]) => `${r}:${n}`)
    .join(", ");
  await logAudit("Lidlar kunlik taqsimlandi", {
    entity: "Client",
    detail:
      `${assigned} mijoz → ${operators.length} operator (sig'im ${capacity})` +
      (shiftLabel ? ` · smena: ${shiftLabel}` : "") +
      ` · fokus: ${label}${active.todayOnly ? " (faqat bugunga)" : ""} · ` +
      `majburiy: ${floorTotal.count} · egasida qoldi: ${kept}` +
      (granted ? ` · qo'shimcha grant: +${granted}` : "") +
      (pulled ? ` · oldinga tortildi: ${pulled}` : "") +
      ` · avto kvota: ${fallbackAuto.dayAuto}` +
      (fallbackOpIds.some(isNight) ? ` (kechki: ${fallbackAuto.nightAuto})` : "") +
      (released ? ` · tugagan smenadan olindi: ${released}` : "") +
      ` · navbatda: ${unassigned.length}` +
      (usedFallback ? " · ⚠️ jadval belgilanmagan, zaxira brigada ishlatildi" : "") +
      (regionEnabled
        ? ` · viloyat rejimi: yoqilgan (${regionSummary || "qoplangan viloyat yo'q"} · umumiy: ${fallbackAssigned})`
        : ""),
  });
  return {
    assigned,
    operators: operators.length,
    kept,
    floor: floorTotal.count,
    released,
    granted,
    capacity,
    autoLimit: fallbackAuto.dayAuto,
    pulled,
    shift,
    shiftLabel,
    profileLabel: label,
    todayOnly: active.todayOnly,
    usedFallbackRoster: usedFallback,
    regionEnabled,
    regionAssigned: [...regionAssignedCount.values()].reduce((s, n) => s + n, 0),
    fallbackAssigned,
  };
}

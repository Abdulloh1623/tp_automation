// Taqsimotning sof (DB'siz) mantig'i — izolyatsiyada testlanadi.

import { normalizeRegion, parseRegions, type LeadSegment, type ProfileShare } from "@/lib/constants";

export type OperatorSlot = { id: string; cap: number };

/**
 * id'larni operatorlarga round-robin taqsimlaydi, har biriga O'Z sig'imi (`cap`)
 * gacha. Sig'imi tugagan operator aylanadan chiqadi; hech kimda joy qolmasa
 * qolgani `overflow`ga tushadi. Kirish ro'yxati ustuvorlik bo'yicha tartiblangan
 * bo'lsa, har operatorning ulushi ham shu tartibda qoladi.
 */
export function splitByCapacity(
  ids: string[],
  ops: OperatorSlot[],
): { byOp: Map<string, string[]>; overflow: string[] } {
  const byOp = new Map<string, string[]>(ops.map((o) => [o.id, []]));
  const overflow: string[] = [];
  const open = ops.filter((o) => o.cap > 0);
  let cursor = 0;

  for (const id of ids) {
    if (open.length === 0) {
      overflow.push(id);
      continue;
    }
    if (cursor >= open.length) cursor = 0;
    const op = open[cursor];
    const list = byOp.get(op.id)!;
    list.push(id);
    if (list.length >= op.cap) {
      open.splice(cursor, 1); // sig'imi to'ldi — aylanadan chiqadi
    } else {
      cursor++;
    }
  }
  return { byOp, overflow };
}

/**
 * id'larni operatorlarga round-robin taqsimlaydi, har biriga `cap` gacha.
 * Sig'imdan (operatorlar×cap) ortgani `overflow`ga tushadi.
 */
export function splitRoundRobin(
  ids: string[],
  operatorIds: string[],
  cap: number,
): { byOp: Map<string, string[]>; overflow: string[] } {
  return splitByCapacity(
    ids,
    operatorIds.map((id) => ({ id, cap })),
  );
}

/**
 * Kunlik fokus: segmentlarga bo'lingan hovuzdan `capacity` ta lidni profil
 * ULUSHLARI bo'yicha tanlaydi.
 *
 * 1. `floor` (majburiy pol) — profildan qat'i nazar birinchi kiradi.
 * 2. Qolgan joy segmentlar bo'yicha kvotaga bo'linadi (ulush % da).
 * 3. Segmentda yetarli lid bo'lmasa, bo'sh joy profil tartibida keyingi
 *    segmentlarga OQADI — kvota tufayli joy bo'sh qolmaydi.
 *
 * Qaytadigan `picked` ustuvorlik tartibida (pol → segment kvotalari) — shu
 * tartib operator board'idagi saralashga ham asos bo'ladi.
 */
export function allocateByProfile(
  buckets: Map<LeadSegment, string[]>,
  order: ProfileShare[],
  floor: string[],
  capacity: number,
): { picked: string[]; leftover: string[] } {
  const picked: string[] = [];
  const taken = new Set<string>();
  const take = (id: string) => {
    if (taken.has(id) || picked.length >= capacity) return false;
    taken.add(id);
    picked.push(id);
    return true;
  };

  for (const id of floor) take(id);

  // Kvota poldan KEYIN qolgan joydan hisoblanadi (pol allaqachon o'z joyini oldi).
  const budget = Math.max(0, capacity - picked.length);
  for (const { segment, share } of order) {
    const quota = Math.round((budget * share) / 100);
    let used = 0;
    for (const id of buckets.get(segment) ?? []) {
      if (used >= quota) break;
      if (take(id)) used++;
    }
  }

  // Spillover — kvotadan keyin bo'sh joy qolsa, profil tartibida to'ldiriladi.
  for (const { segment } of order) {
    if (picked.length >= capacity) break;
    for (const id of buckets.get(segment) ?? []) {
      if (picked.length >= capacity) break;
      take(id);
    }
  }

  const leftover: string[] = [];
  for (const list of buckets.values()) {
    for (const id of list) if (!taken.has(id)) leftover.push(id);
  }
  return { picked, leftover };
}

// --- Viloyat bo'yicha taqsimlash (kunlik lid) ---
//
// Har operator qoplaydigan viloyat(lar) — kanonik nom -> shu viloyatni
// bugun qoplaydigan (ishlayotgan) operator id'lari ro'yxati.
export type RegionCoverage = Map<string, string[]>;

/**
 * Bugun ishlayotgan operatorlarning viloyat qamrovini quradi. Ustalar uchun
 * ishlatiladigan `usta-region.ts` bilan bir xil manba (`User.regions`/`region`,
 * `parseRegions` + `normalizeRegion`), lekin natija BIR EMAS — bitta viloyatni
 * bir nechta operator qoplashi mumkin (shunda ular orasida keyinroq
 * `splitByCapacity` bilan bo'linadi).
 */
export function buildRegionCoverage(
  operators: { id: string; region: string | null; regions: string | null }[],
): RegionCoverage {
  const coverage: RegionCoverage = new Map();
  for (const o of operators) {
    for (const raw of parseRegions(o.regions, o.region)) {
      const region = normalizeRegion(raw);
      if (!region) continue;
      const list = coverage.get(region);
      if (list) {
        if (!list.includes(o.id)) list.push(o.id);
      } else {
        coverage.set(region, [o.id]);
      }
    }
  }
  return coverage;
}

/**
 * Mijozlar hovuzini bugun QOPLANGAN viloyat guruhlariga va umumiy (fallback)
 * qismga ajratadi. Fallbackka tushadi: viloyati yo'q/notanish mijozlar VA
 * hech kim (bugun ishlayotgan) qoplamagan viloyat mijozlari — ikkalasi ham
 * "umumiy hovuzga" degan qarorga ko'ra bir xil yo'l bilan taqsimlanadi.
 */
export function splitPoolByRegionCoverage<T extends { region: string | null }>(
  pool: T[],
  coverage: RegionCoverage,
): { byRegion: Map<string, T[]>; fallback: T[] } {
  const byRegion = new Map<string, T[]>();
  const fallback: T[] = [];
  for (const c of pool) {
    const region = normalizeRegion(c.region);
    if (region && coverage.has(region)) {
      const list = byRegion.get(region);
      if (list) list.push(c);
      else byRegion.set(region, [c]);
    } else {
      fallback.push(c);
    }
  }
  return { byRegion, fallback };
}

/**
 * Kunduzgi/kechki og'irlikli avtomatik kvota — bitta hovuz o'lchamini
 * kunduzgi/kechki operatorlar orasida bo'ladi (kechkiga siyosatdagi foizga
 * kamroq). Global (viloyatsiz) va har-viloyat/fallback hisob-kitobida BIR XIL
 * formula ishlatiladi — shu funksiya orqali takrorlanmaydi.
 */
export function weightedAutoLimit(
  poolSize: number,
  dayCount: number,
  nightCount: number,
  discountPercent: number,
  policy: { minPerOperator: number; maxPerOperator: number },
): { dayAuto: number; nightAuto: number } {
  const discount = Math.max(0, Math.min(100, discountPercent)) / 100;
  const weighted = dayCount + nightCount * (1 - discount);
  const dayAuto =
    weighted > 0
      ? Math.min(
          policy.maxPerOperator,
          Math.max(policy.minPerOperator, Math.ceil(poolSize / weighted)),
        )
      : 0;
  const nightAuto = Math.max(0, Math.round(dayAuto * (1 - discount)));
  return { dayAuto, nightAuto };
}

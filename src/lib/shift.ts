// Ish smenasi (kunduzgi/kechki) — YAGONA manba. Sof funksiyalar, UTC+5 ni o'zi
// hisoblaydi (`lib/tz.ts`), server lokal vaqtiga TAYANMAYDI: konteynerda
// `TZ=Asia/Tashkent` qo'yilgan bo'lsa ham, u qo'llanmay qolsa smena oynalari
// 5 soatga siljib ketardi va buni hech kim sezmasdi.
//
// Eslatma: bu yerdagi oynalar — SMENANING o'zi (09:00–18:00 / 18:00–09:00).
// Telegram smena HISOBOTLARI boshqa oynadan foydalanadi (`SHIFT_REPORT`,
// 09:30/17:30) — ular yuborish vaqtlariga bog'langan, aks holda hisobotlar
// orasida qoplanmagan oraliq qolardi.

import type { UserShift } from "./constants";
import { TZ_MIN, tzTimeAt } from "./tz";

export const SHIFT_HOURS = { dayStart: 9, dayEnd: 18 } as const;

/** UTC+5 bo'yicha soat (0–23). */
function tzHour(d: Date): number {
  return new Date(d.getTime() + TZ_MIN * 60000).getUTCHours();
}

/** Berilgan vaqtdagi joriy smena: 09:00–18:00 — kunduzgi, aks holda kechki. */
export function currentShift(now: Date = new Date()): UserShift {
  const h = tzHour(now);
  return h >= SHIFT_HOURS.dayStart && h < SHIFT_HOURS.dayEnd ? "DAY" : "NIGHT";
}

/**
 * Smenaning [start, end) vaqt chegarasi. Kechki smena yarim tunni kesib o'tadi:
 * - hozir ertalab (00:00–09:00) bo'lsa — kechki smena kecha 18:00 dan bugun 09:00 gacha;
 * - aks holda — bugun 18:00 dan ertaga 09:00 gacha.
 */
export function shiftRange(shift: UserShift, now: Date): { start: Date; end: Date } {
  const nine = tzTimeAt(SHIFT_HOURS.dayStart, 0, 0, now);
  const eighteen = tzTimeAt(SHIFT_HOURS.dayEnd, 0, 0, now);
  if (shift === "DAY") return { start: nine, end: eighteen };
  if (now < nine) {
    return { start: tzTimeAt(SHIFT_HOURS.dayEnd, 0, 1, now), end: nine };
  }
  return { start: eighteen, end: tzTimeAt(SHIFT_HOURS.dayStart, 0, -1, now) };
}

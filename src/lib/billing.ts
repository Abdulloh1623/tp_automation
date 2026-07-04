// To'lov tsikli (billing) yordamchilari — shartnoma sanasidan keyingi oylik
// to'lov sanasini hisoblaydi. Server action, cron va bir martalik data-fix
// skripti — hammasi shu yagona mantiqni ishlatadi (izchillik uchun).
import { addMonths, getDaysInMonth, startOfDay, startOfMonth } from "date-fns";

/**
 * `anchor` (shartnoma yoki mijoz yaratilgan) sanasining oylik "kun"iga
 * asoslanib, `from` (odatda bugun) sanasidan boshlab eng yaqin (shu kundagi
 * yoki keyingi) to'lov sanasini qaytaradi.
 *
 * - Oyda o'sha kun bo'lmasa (masalan 31-kun 30 kunlik oyda) — oyning oxirgi
 *   kuniga qisqartiriladi (31 → 30/28).
 * - Natija soati 12:00 (peshin) qilib belgilanadi — bu vaqt mintaqasi
 *   siljishidan (UTC saqlash / lokal ko'rsatish) kelib chiqadigan "bir kun
 *   kam/ortiq" xatosini oldini oladi (seed.ts bilan bir xil yondashuv).
 *
 * Misol: anchor = 14-aprel, from = 2026-07-04 → 2026-07-14.
 *        anchor = 2-may,   from = 2026-07-04 → 2026-08-02 (2-iyul o'tib ketgan).
 */
export function computeNextPaymentDate(anchor: Date, from: Date = new Date()): Date {
  const day = anchor.getDate(); // 1..31
  const today = startOfDay(from);

  const occurrenceIn = (ref: Date): Date => {
    const monthStart = startOfMonth(ref);
    const clampedDay = Math.min(day, getDaysInMonth(monthStart));
    return new Date(monthStart.getFullYear(), monthStart.getMonth(), clampedDay, 12, 0, 0, 0);
  };

  let candidate = occurrenceIn(today);
  if (candidate < today) candidate = occurrenceIn(addMonths(today, 1));
  return candidate;
}

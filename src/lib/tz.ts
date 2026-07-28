// Vaqt mintaqasi yordamchilari — O'zbekiston (UTC+5, DST yo'q). SOF funksiyalar,
// server VA klient komponentlarda ishlatsa bo'ladi (og'ir/server-only import YO'Q).
//
// NEGA kerak: kun bo'yicha guruhlash (streak, "bir kun = bir katak") lokal
// Toshkent kuni bo'yicha bo'lishi kerak. `toISOString().slice(0,10)` esa UTC
// sanasini beradi — 00:00–05:00 (Toshkent) oralig'idagi vaqt oldingi kunga
// tushib, hisobni buzadi. Shu bois hamma joyda `tzDayKey` ishlatiladi.

export const TZ_MIN = 5 * 60; // UTC+5 (O'zbekiston)

/** UTC+5 kun boshini (real UTC instant) qaytaradi. daysAgo=0 → bugun. */
export function startOfTzDay(daysAgo = 0): Date {
  const s = new Date(Date.now() + TZ_MIN * 60000);
  s.setUTCDate(s.getUTCDate() - daysAgo);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - TZ_MIN * 60000);
}

/**
 * Berilgan vaqtning UTC+5 kun boshi. `startOfTzDay` dan farqi — SOF funksiya
 * (`Date.now()` ga tayanmaydi), shuning uchun testlarda "hozir"ni uzatsa bo'ladi.
 */
export function tzDayStart(d: Date): Date {
  const s = new Date(d.getTime() + TZ_MIN * 60000);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - TZ_MIN * 60000);
}

/** `a` va `b` orasidagi to'liq UTC+5 kunlar farqi (b - a). */
export function tzDaysBetween(a: Date, b: Date): number {
  return Math.round((tzDayStart(b).getTime() - tzDayStart(a).getTime()) / 86400000);
}

/** UTC+5 oy boshini qaytaradi. */
export function startOfTzMonth(): Date {
  const s = new Date(Date.now() + TZ_MIN * 60000);
  s.setUTCDate(1);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - TZ_MIN * 60000);
}

/** UTC+5 bo'yicha "DD.MM.YYYY". */
export function tzDateLabel(d = new Date()): string {
  const s = new Date(d.getTime() + TZ_MIN * 60000);
  const dd = String(s.getUTCDate()).padStart(2, "0");
  const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${s.getUTCFullYear()}`;
}

/**
 * UTC+5 (Toshkent) taqvim kuni kaliti: "YYYY-MM-DD". Kun bo'yicha guruhlash va
 * "bugun"ni aniqlashda `toISOString().slice(0,10)` (UTC) O'RNIGA shuni ishlating.
 */
export function tzDayKey(d: Date): string {
  const s = new Date(d.getTime() + TZ_MIN * 60000);
  const yyyy = s.getUTCFullYear();
  const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(s.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

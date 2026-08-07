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

/**
 * UTC+5 bo'yicha belgilangan soat:daqiqa (real UTC instant). `daysAgo=0` — bugun.
 * Smena hisobotlarining oyna chegaralari shu orqali hisoblanadi.
 */
export function tzTimeAt(hour: number, minute = 0, daysAgo = 0, now = new Date()): Date {
  const s = new Date(now.getTime() + TZ_MIN * 60000);
  s.setUTCDate(s.getUTCDate() - daysAgo);
  s.setUTCHours(hour, minute, 0, 0);
  return new Date(s.getTime() - TZ_MIN * 60000);
}

/**
 * UTC+5 bo'yicha sana/vaqt qismlari — matn formatlash uchun (utils.ts).
 *
 * Barchasi nol bilan to'ldirilgan satr; `weekday` 0=yakshanba.
 */
export function tzParts(d: Date): {
  yyyy: string;
  mm: string;
  dd: string;
  hh: string;
  mi: string;
  month: number; // 0-asosli
  weekday: number; // 0 = yakshanba
} {
  const s = new Date(d.getTime() + TZ_MIN * 60000);
  return {
    yyyy: String(s.getUTCFullYear()),
    mm: String(s.getUTCMonth() + 1).padStart(2, "0"),
    dd: String(s.getUTCDate()).padStart(2, "0"),
    hh: String(s.getUTCHours()).padStart(2, "0"),
    mi: String(s.getUTCMinutes()).padStart(2, "0"),
    month: s.getUTCMonth(),
    weekday: s.getUTCDay(),
  };
}

/** UTC+5 bo'yicha "HH:MM". */
export function tzTimeLabel(d: Date): string {
  const s = new Date(d.getTime() + TZ_MIN * 60000);
  return `${String(s.getUTCHours()).padStart(2, "0")}:${String(s.getUTCMinutes()).padStart(2, "0")}`;
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

/**
 * `<input type="date">` qiymatini ("YYYY-MM-DD", mahalliy taqvim kuni) UTC+5
 * kun boshiga (real UTC instant) aylantiradi. Yaroqsiz/bo'sh bo'lsa `null` —
 * `new Date("YYYY-MM-DD")` (UTC kun boshi) ishlatilsa, sana filtri Toshkent
 * kunidan ~5 soat siljib ketardi.
 */
export function tzDayStartFromInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)) - TZ_MIN * 60000);
}

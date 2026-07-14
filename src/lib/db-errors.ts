// O'tkinchi (transient) DB xatolarini aniqlash — postgres ulanishni bir lahzaga
// yopganda (deploy/restart/xotira bosimi) Prisma birinchi so'rovni xatoga
// chiqaradi. Bunday xato haqiqiy bug emas: qayta urinishда yoki keyingi
// so'rovda o'zi tuzaladi. Shu funksiya orqali ularni retry qilamiz va xato
// kanaliga yubormaymiz.

// Ulanish darajasidagi Prisma xato kodlari (mantiqiy emas — infratuzilma).
const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Connection pool timeout
]);

/**
 * Xato o'tkinchi DB-ulanish xatosimi? Prisma xato kodi yoki xabar matni
 * bo'yicha aniqlaydi (Prisma'ni import qilmasdan — edge'da ham xavfsiz).
 */
export function isTransientDbError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  if (TRANSIENT_PRISMA_CODES.has(code)) return true;
  const msg = typeof e?.message === "string" ? e.message : "";
  return /server has closed the connection|can't reach database|connection (was |is )?(closed|reset|refused|terminated)/i.test(
    msg,
  );
}

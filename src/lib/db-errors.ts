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

// Xabar matni bo'yicha aniqlanadigan o'tkinchi holatlar. Postgres serverning
// o'zi qayta ko'tarilayotganda (halokatdan keyingi tiklanish, restart, deploy)
// Prisma KODSIZ `PrismaClientUnknownRequestError` qaytaradi — xato faqat
// "Error in connector: ... FATAL: ..." matni ichida bo'ladi, shuning uchun
// matn bo'yicha aniqlash shart.
const TRANSIENT_MESSAGE_RE = new RegExp(
  [
    "server has closed the connection",
    "can't reach database",
    "connection (was |is )?(closed|reset|refused|terminated)",
    "connection terminated unexpectedly",
    // Postgres server holati: halokatdan keyingi tiklanish / ko'tarilish / to'xtash
    "database system is (in recovery mode|starting up|shutting down)",
    "database system is not yet accepting connections",
    "terminating connection due to (administrator command|crash of another server process|unexpected postmaster exit|conflict with recovery)",
    // Ulanish sig'imi/vaqti — qisqa muddatli bosim
    "too many clients already",
    "timed out fetching a new connection",
    // Tarmoq darajasidagi soket xatolari
    "econnreset|econnrefused|etimedout|socket hang up",
  ].join("|"),
  "i",
);

/**
 * Xato o'tkinchi DB-ulanish xatosimi? Prisma xato kodi yoki xabar matni
 * bo'yicha aniqlaydi (Prisma'ni import qilmasdan — edge'da ham xavfsiz).
 */
export function isTransientDbError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  if (TRANSIENT_PRISMA_CODES.has(code)) return true;
  const msg = typeof e?.message === "string" ? e.message : "";
  return TRANSIENT_MESSAGE_RE.test(msg);
}

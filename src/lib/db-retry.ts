// O'tkinchi DB-ulanish uzilishida bir marta qayta uriladigan o'ram.
// Postgres ulanishni yopganda (deploy/restart) Prisma birinchi so'rovni xatoga
// chiqaradi, lekin keyingi so'rovда o'zi qayta ulanadi — shu sabab qisqa
// kechikishdan so'ng bir marta qayta urinish uzilishni muvaffaqiyatli javobga
// aylantiradi. Ayniqsa 7 soniyada bir so'rov yuboradigan analytics polling
// endpoint'lari uchun foydali.
import { isTransientDbError } from "./db-errors";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `fn`ni ishga tushiradi; o'tkinchi DB xatosi bo'lsa `retries` marta qayta
 * uriladi (default 1), har urinish orasida `delayMs` (default 150ms). Boshqa
 * xatolar darhol yuqoriga uzatiladi.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 150,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientDbError(err)) {
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

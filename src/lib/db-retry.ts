// O'tkinchi DB-ulanish uzilishida qayta uriladigan o'ram.
// Postgres ulanishni yopganda (deploy/restart) Prisma birinchi so'rovni xatoga
// chiqaradi, lekin keyingi so'rovда o'zi qayta ulanadi — shu sabab qisqa
// kechikishdan so'ng qayta urinish uzilishni muvaffaqiyatli javobga
// aylantiradi. Ayniqsa 7 soniyada bir so'rov yuboradigan analytics polling
// endpoint'lari uchun foydali.
import { isTransientDbError } from "./db-errors";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type DbRetryOptions = {
  /** Har urinishdan keyin kechikish shu songa ko'paytiriladi (1 = doimiy). */
  factor?: number;
  /** Kechikishning yuqori chegarasi (ms). */
  maxDelayMs?: number;
  /** Qayta urinishdan oldin chaqiriladi — log yozish uchun (throw qilmasin). */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
};

/**
 * `fn`ni ishga tushiradi; o'tkinchi DB xatosi bo'lsa `retries` marta qayta
 * uriladi (default 1), birinchi urinish orasida `delayMs` (default 150ms).
 * Boshqa xatolar darhol yuqoriga uzatiladi.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 150,
  opts: DbRetryOptions = {},
): Promise<T> {
  const { factor = 1, maxDelayMs = 60_000, onRetry } = opts;
  let lastErr: unknown;
  let wait = delayMs;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientDbError(err)) {
        const delay = Math.min(wait, maxDelayMs);
        try {
          onRetry?.(attempt + 1, delay, err);
        } catch {
          // log xatosi asosiy oqimni buzmasin
        }
        await sleep(delay);
        wait = wait * factor;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Fon ishlari (cron: taqsimot, eslatma, hisobot, backup) uchun sabrli o'ram.
 * Postgres halokatdan keyin tiklanayotgan bo'lsa ("the database system is in
 * recovery mode") baza bir necha soniyadan bir daqiqagacha yopiq bo'lishi
 * mumkin — 2s dan boshlab ikkilantirib ~62s kutadi (2+4+8+16+32).
 * Web so'rovlarida ishlatmang: u yerda foydalanuvchi kutib turadi.
 */
export function withDbJobRetry<T>(
  fn: () => Promise<T>,
  onRetry?: DbRetryOptions["onRetry"],
): Promise<T> {
  return withDbRetry(fn, 5, 2_000, { factor: 2, onRetry });
}

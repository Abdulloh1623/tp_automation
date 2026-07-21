// Oddiy in-memory "sliding window" rate-limit.
//
// Jarayon ichida ishlaydi (qayta ishga tushganda nollanadi) — bu bizning
// bitta konteynerli deploy uchun yetarli. Maqsad: resurs suiiste'molining
// oldini olish, kriptografik kafolat berish emas.

type Bucket = { count: number; first: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    /** Xotira o'sishiga qarshi qattiq chegara. */
    private readonly maxKeys = 5_000,
  ) {}

  /** Ruxsat berilsa true; chegaradan oshgan bo'lsa false. */
  allow(key: string, now: number = Date.now()): boolean {
    const b = this.buckets.get(key);
    if (!b || now - b.first > this.windowMs) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      this.buckets.set(key, { count: 1, first: now });
      return true;
    }
    if (b.count >= this.max) return false;
    b.count += 1;
    return true;
  }

  /** Joriy oynadagi urinishlar soni (test/diagnostika uchun). */
  count(key: string, now: number = Date.now()): number {
    const b = this.buckets.get(key);
    if (!b || now - b.first > this.windowMs) return 0;
    return b.count;
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }

  private sweep(now: number): void {
    for (const [k, v] of this.buckets) {
      if (now - v.first > this.windowMs) this.buckets.delete(k);
    }
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) break;
      this.buckets.delete(oldest.value);
    }
  }
}

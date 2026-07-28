// Biznex obuna holatini mijozlarga ko'chirish (fon sinxronizatsiyasi).
// Ilgari faqat `scripts/sync-biznex.ts` ichida edi — endi worker cron'i ham
// shu yadroni chaqiradi, ya'ni ro'yxat o'zi yangilanib turadi.
//
// Biznex to'liq obunalar ro'yxatini BIR marta oladi va keshlaydi (billing.ts),
// shuning uchun yuzlab mijoz uchun ham bitta API so'rovi ketadi.

import { db } from "./db";
import { getBiznexSubscription, biznexStatusFlag } from "./billing";

export type BiznexSyncResult = {
  /** .env da BIZNEX_API_URL va BIZNEX_STATIC_TOKEN bormi. */
  configured: boolean;
  checked: number;
  updated: number;
  notFound: number;
  /** "unknown" — API o'chiq/xato; mavjud flag O'CHIRILMAYDI. */
  skipped: number;
};

export function biznexConfigured(): boolean {
  return !!process.env.BIZNEX_API_URL && !!process.env.BIZNEX_STATIC_TOKEN;
}

/**
 * Mijozlarning `biznexStatus` / `biznexCheckedAt` flaglarini yangilaydi va
 * Biznex haqiqiy obuna topilganda lokal billing maydonlarini (status,
 * nextPaymentDate) unga moslashtiradi.
 *
 * @param opts.staleOnly hali hech qachon tekshirilmaganlar (`biznexCheckedAt=null`)
 * @param opts.limit     nechta mijozni tekshirish
 * @param opts.onEach    har mijozdan keyin (progress logi uchun)
 */
export async function syncBiznex(
  opts: {
    staleOnly?: boolean;
    limit?: number;
    onEach?: (done: number, total: number, name: string) => void;
  } = {},
): Promise<BiznexSyncResult> {
  const result: BiznexSyncResult = {
    configured: biznexConfigured(),
    checked: 0,
    updated: 0,
    notFound: 0,
    skipped: 0,
  };
  if (!result.configured) return result;

  const clients = await db.client.findMany({
    where: opts.staleOnly ? { biznexCheckedAt: null } : {},
    select: { id: true, restaurantName: true, phone: true },
    orderBy: { createdAt: "asc" },
    ...(opts.limit ? { take: opts.limit } : {}),
  });

  for (const c of clients) {
    const sub = await getBiznexSubscription(c.phone);
    const flag = biznexStatusFlag(sub);
    result.checked++;
    opts.onEach?.(result.checked, clients.length, c.restaurantName);

    // "unknown" (API o'chiq/sozlanmagan) — mavjud flagni buzmaymiz.
    if (flag === null) {
      result.skipped++;
      continue;
    }
    if (flag === "NOT_FOUND") result.notFound++;

    const data: {
      biznexStatus: string;
      biznexCheckedAt: Date;
      status?: string;
      nextPaymentDate?: Date;
    } = { biznexStatus: flag, biznexCheckedAt: new Date() };

    // Mijoz sahifasidagi "Obuna va to'lov" kartasi lokal `nextPaymentDate` va
    // `status` maydonlariga tayanadi. Biznex haqiqiy obunani qaytarganda
    // (active/expired/inactive) shu maydonlarni unga moslashtiramiz.
    // NOT_FOUND / unknown holatida tegilmaydi — lokal ma'lumot saqlanadi.
    if (sub.status === "active" || sub.status === "expired" || sub.status === "inactive") {
      if (sub.expiresAt) {
        const exp = new Date(sub.expiresAt);
        if (!Number.isNaN(exp.getTime())) data.nextPaymentDate = exp;
      }
      data.status = sub.active ? "ACTIVE" : "INACTIVE";
    }

    await db.client.update({ where: { id: c.id }, data });
    result.updated++;
  }

  return result;
}

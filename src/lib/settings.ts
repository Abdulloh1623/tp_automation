import { db } from "@/lib/db";

// Global kalit-qiymat sozlamalar (AppSetting). Hozircha faqat `statsResetAt`.

const STATS_RESET_KEY = "statsResetAt";

/**
 * Tablo (jonli taxta) ko'rsatkichlari shu sanadan boshlab hisoblanadi. null =
 * chegara yo'q (barcha tarix). CallLog o'chirilmaydi — faqat analitika filtri.
 */
export async function getStatsResetAt(): Promise<Date | null> {
  const row = await db.appSetting.findUnique({ where: { key: STATS_RESET_KEY } });
  if (!row) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tablo hisob boshlanish sanasini o'rnatadi (odatda "bugun 00:00"). */
export async function setStatsResetAt(at: Date): Promise<void> {
  await db.appSetting.upsert({
    where: { key: STATS_RESET_KEY },
    create: { key: STATS_RESET_KEY, value: at.toISOString() },
    update: { value: at.toISOString() },
  });
}

/** Chegarani olib tashlaydi (butun tarix qayta hisobga olinadi). */
export async function clearStatsResetAt(): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: STATS_RESET_KEY } });
}

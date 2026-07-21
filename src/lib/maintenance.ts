// Texnik tanaffus (maintenance) rejimi.
//
// Bazani backupdan tiklash paytida ilova jadvallarni o'chirib-qayta yaratadi
// (pg_dump --clean). Shu bir necha soniya ichida ochiq sahifalar xato beradi
// va — muhimrog'i — xodim tasodifan yozuv qilib, u tiklash bilan yo'qolishi
// mumkin. Tanaffus rejimi shuni oldini oladi.
//
// MUHIM (bilib qo'yish kerak): bayroq AppSetting jadvalida turadi, ya'ni
// tiklash uni ham almashtiradi. Amalda bu qulay — tiklash tugagach bayroq
// dump ichidagi holatga qaytadi (odatda "o'chiq"). Lekin tiklash YARIM YO'LDA
// uzilib qolsa bayroq holati aniq bo'lmay qoladi; shu bois UI'da har doim
// qo'lda "tanaffusni tugatish" tugmasi bor.

import { db } from "@/lib/db";

const KEY = "maintenance";

export type Maintenance = {
  active: boolean;
  /** Foydalanuvchiga ko'rsatiladigan sabab. */
  reason: string;
  /** Kim yoqqan (audit uchun). */
  byName: string | null;
  startedAt: Date | null;
};

const OFF: Maintenance = { active: false, reason: "", byName: null, startedAt: null };

/**
 * Joriy holat. Baza yetib bo'lmasa (aynan tiklash paytida shunday bo'ladi) —
 * "o'chiq" qaytaradi, aks holda ilova butunlay ochilmay qolardi.
 */
export async function getMaintenance(): Promise<Maintenance> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: KEY } });
    if (!row) return OFF;
    const p = JSON.parse(row.value) as Partial<Maintenance>;
    if (!p.active) return OFF;
    return {
      active: true,
      reason: typeof p.reason === "string" ? p.reason : "",
      byName: typeof p.byName === "string" ? p.byName : null,
      startedAt: p.startedAt ? new Date(p.startedAt) : null,
    };
  } catch {
    return OFF;
  }
}

/** Tanaffusni yoqadi. */
export async function startMaintenance(reason: string, byName: string): Promise<void> {
  const value = JSON.stringify({
    active: true,
    reason: reason.slice(0, 300),
    byName,
    startedAt: new Date().toISOString(),
  });
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
}

/** Tanaffusni tugatadi. */
export async function endMaintenance(): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: KEY } });
}

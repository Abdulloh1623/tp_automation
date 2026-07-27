// Disk bo'sh joyini kuzatish. 2026-07-26/27 hodisasi: disk to'lib qolgan,
// postgres WAL yozolmay halokatga uchragan ("the database system is in recovery
// mode") va kunlik taqsimot ikki kun bajarilmagan. Disk to'lganini OLDINDAN
// bilish uchun shu modul ishlatiladi.
import { statfs } from "fs/promises";

export type DiskUsage = {
  totalGb: number;
  freeGb: number;
  /** Band foiz (0–100). */
  usedPct: number;
};

/** Chegara: shundan kam bo'sh joy qolganda ogohlantiramiz. */
export const DISK_WARN_FREE_GB = 3;
export const DISK_WARN_USED_PCT = 85;

/** Berilgan yo'l joylashgan disk (fayl tizimi) holatini qaytaradi. */
export async function getDiskUsage(dir = process.cwd()): Promise<DiskUsage | null> {
  try {
    const s = await statfs(dir);
    const total = Number(s.blocks) * Number(s.bsize);
    // bavail — oddiy foydalanuvchiga ochiq bo'sh joy (bfree root rezervini ham
    // qo'shadi, shuning uchun bavail haqiqatga yaqinroq).
    const free = Number(s.bavail) * Number(s.bsize);
    if (!Number.isFinite(total) || total <= 0) return null;
    const gb = (n: number) => Math.round((n / 1024 ** 3) * 10) / 10;
    return {
      totalGb: gb(total),
      freeGb: gb(free),
      usedPct: Math.round(((total - free) / total) * 100),
    };
  } catch {
    // statfs qo'llab-quvvatlanmasa (ekzotik FS) — kuzatuvni o'tkazib yuboramiz
    return null;
  }
}

/** Disk holati xavflimi? (bo'sh joy kam yoki bandlik yuqori) */
export function isDiskLow(
  u: DiskUsage,
  freeGb = DISK_WARN_FREE_GB,
  usedPct = DISK_WARN_USED_PCT,
): boolean {
  return u.freeGb < freeGb || u.usedPct >= usedPct;
}

/** Ogohlantirish matni (sof funksiya — test qilinadi). */
export function diskWarning(u: DiskUsage): string {
  return (
    `Diskda joy kam: ${u.freeGb} GB bo'sh / ${u.totalGb} GB (band ${u.usedPct}%). ` +
    `Disk to'lsa postgres yozolmay halokatga uchraydi (recovery mode) va cron ishlari to'xtaydi. ` +
    `Tekshiring: docker system df · du -sh backups uploads · docker system prune -af`
  );
}

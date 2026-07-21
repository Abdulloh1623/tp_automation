"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { guardRole, createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  openBackupFile,
  inspectDump,
  verifyByRestore,
  restoreToLive,
  type DumpInfo,
  type TableCount,
} from "@/lib/restore";
import { startMaintenance, endMaintenance, getMaintenance } from "@/lib/maintenance";

// Yuklangan backup fayllari shu yerda vaqtincha turadi. Tiklash ikki bosqichli
// bo'lgani uchun fayl "tekshirish" va "tiklash" oralig'ida saqlanishi kerak —
// uni brauzerga qaytarib, keyin qayta yuklash xavfli va sekin bo'lardi.
const STAGING_DIR = path.join(process.cwd(), "uploads", "restore");
const MAX_BYTES = 500 * 1024 * 1024; // 500MB — dump gzip'langan holda kichik

export type VerifyState = {
  ok?: boolean;
  error?: string;
  /** Tiklash uchun token (staging fayl nomi). Faqat tekshiruv o'tsa beriladi. */
  token?: string;
  fileName?: string;
  info?: DumpInfo;
  actual?: TableCount[];
  warnings?: string[];
};

export type RestoreState = {
  ok?: boolean;
  error?: string;
  restored?: TableCount[];
  safetyBackup?: string;
  /** Tiklangan bazada hisob topilmadi — foydalanuvchi chiqarib yuboriladi. */
  loggedOut?: boolean;
};

/**
 * Tiklangan baza bo'yicha sessiyani qayta beradi. Hisob dump ichida bo'lmasa
 * `false` qaytaradi — bu holda foydalanuvchi chiqib ketadi va tiklangan
 * bazadagi hisob bilan qayta kirishi kerak bo'ladi.
 */
async function reissueSession(userId: string, username: string): Promise<boolean> {
  try {
    const u = await db.user.findFirst({
      where: { OR: [{ id: userId }, { username }] },
      select: { id: true, name: true, username: true, role: true, isActive: true, sessionVersion: true },
    });
    if (!u || !u.isActive || u.role === "INSTALLER") return false;
    await createSession({
      userId: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      version: u.sessionVersion,
    });
    return true;
  } catch {
    return false;
  }
}

async function requireAdmin() {
  const g = await guardRole(["ADMIN"]);
  return g;
}

/** Token faqat bizning staging faylimizga ishora qilsin (path traversal yo'q). */
function stagingPath(token: string): string | null {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  return path.join(STAGING_DIR, `${token}.sql`);
}

/**
 * 1-BOSQICH — TEKSHIRISH.
 *
 * Faylni ochadi (shifr/gzip), ichini sanaydi va VAQTINCHALIK bazaga tiklab
 * ko'radi. Jonli bazaga tegilmaydi. Muvaffaqiyatli bo'lsa `token` qaytaradi —
 * tiklash faqat shu token bilan mumkin, ya'ni tekshirilmagan fayl hech qachon
 * jonli bazaga tushmaydi.
 */
export async function verifyBackupUpload(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const g = await requireAdmin();
  if (!g.ok) return { error: g.error };

  const file = formData.get("backup");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Fayl tanlanmagan" };
  }
  if (file.size > MAX_BYTES) {
    return { error: `Fayl juda katta (${Math.round(file.size / 1024 / 1024)}MB, chegara 500MB)` };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const opened = openBackupFile(buf, { encryptionKey: process.env.BACKUP_ENCRYPTION_KEY });
  if (!opened.ok) return { error: opened.error };

  const info = inspectDump(opened.sql);
  if (info.missingCoreTables.length > 0) {
    return {
      error: `Bu backup to'liq emas — asosiy jadvallar yo'q: ${info.missingCoreTables.join(", ")}`,
      info,
    };
  }

  // Haqiqiy sinov: vaqtinchalik bazaga tiklab ko'ramiz.
  const verified = await verifyByRestore(opened.sql);
  if (!verified.ok) {
    return {
      error: `Tekshiruvdan o'tmadi: ${verified.error ?? "noma'lum xato"}`,
      info,
      warnings: verified.warnings,
    };
  }

  // Fayl tiklash bosqichigacha saqlanadi.
  const token = randomUUID().replace(/-/g, "");
  await fs.mkdir(STAGING_DIR, { recursive: true });
  await fs.writeFile(path.join(STAGING_DIR, `${token}.sql`), opened.sql, "utf8");

  await logAudit("Backup tekshirildi", {
    entity: "System",
    detail: `${file.name} — ${info.totalRows} qator, ${info.tables.length} jadval`,
  });

  return {
    ok: true,
    token,
    fileName: file.name,
    info,
    actual: verified.actual,
    warnings: verified.warnings,
  };
}

/**
 * 2-BOSQICH — TIKLASH. Butun bazani almashtiradi.
 *
 * Himoyalar: ADMIN + tekshiruv tokeni + yozib tasdiqlash + avtomatik
 * xavfsizlik nusxasi (restoreToLive ichida) + texnik tanaffus.
 */
export async function restoreFromBackup(
  _prev: RestoreState,
  formData: FormData,
): Promise<RestoreState> {
  const g = await requireAdmin();
  if (!g.ok) return { error: g.error };

  const token = String(formData.get("token") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "TIKLASH") {
    return { error: 'Tasdiqlash uchun katta harflar bilan "TIKLASH" deb yozing' };
  }

  const file = stagingPath(token);
  if (!file) return { error: "Tekshiruv tokeni noto'g'ri — faylni qaytadan tekshiring" };

  let sql: string;
  try {
    sql = await fs.readFile(file, "utf8");
  } catch {
    return { error: "Tekshirilgan fayl topilmadi — jarayonni qaytadan boshlang" };
  }

  // Tanaffusni YOQAMIZ: tiklash davomida xodim kiritgan ma'lumot yo'qolib
  // ketmasin (u eski dump bilan almashadi).
  await startMaintenance("Ma'lumotlar bazasi backupdan tiklanmoqda", g.session.name);

  const res = await restoreToLive(sql);

  // Tiklash bazani (jumladan AppSetting'ni) almashtirgani uchun tanaffus
  // bayrog'i dump ichidagi holatga qaytadi — odatda "o'chiq". Baribir aniq
  // o'chiramiz: tiklash muvaffaqiyatsiz bo'lsa bayroq osilib qolmasin.
  try {
    await endMaintenance();
  } catch {
    /* baza nomuvofiq bo'lsa — UI'dagi qo'lda tugma bor */
  }

  // Staging faylni tozalaymiz (ikkinchi marta tasodifan qo'llanmasin).
  await fs.rm(file, { force: true }).catch(() => {});

  if (!res.ok) {
    await logAudit("Backupdan tiklash XATO", {
      entity: "System",
      detail: `${res.error} · xavfsizlik nusxasi: ${res.safetyBackup ?? "yo'q"}`,
    }).catch(() => {});
    return { error: res.error, safetyBackup: res.safetyBackup };
  }

  await logAudit("Backupdan tiklandi", {
    entity: "System",
    detail: `Tiklandi: ${(res.actual ?? []).map((a) => `${a.table}=${a.rows}`).join(", ")} · xavfsizlik nusxasi: ${res.safetyBackup}`,
  }).catch(() => {});

  // Tiklash `User` jadvalini ham almashtirdi — jumladan `sessionVersion` ni.
  // Ya'ni admin cookie'sidagi versiya endi mos kelmaydi va u keyingi so'rovda
  // tizimdan chiqarib yuboriladi — natijani KO'RMASDAN. Shu bois sessiyani
  // qayta beramiz (agar hisob tiklangan bazada hali mavjud bo'lsa).
  const reissue = await reissueSession(g.session.userId, g.session.username);

  revalidatePath("/", "layout");
  return {
    ok: true,
    restored: res.actual,
    safetyBackup: res.safetyBackup,
    loggedOut: !reissue,
  };
}

/** Tanaffus osilib qolsa — qo'lda o'chirish. */
export async function stopMaintenance(): Promise<{ ok: boolean; error?: string }> {
  const g = await requireAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  await endMaintenance();
  await logAudit("Texnik tanaffus tugatildi", { entity: "System" });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** UI uchun joriy tanaffus holati. */
export async function maintenanceStatus() {
  const g = await requireAdmin();
  if (!g.ok) return { active: false };
  const m = await getMaintenance();
  return { active: m.active, reason: m.reason, byName: m.byName, startedAt: m.startedAt };
}

/**
 * BACKUP TIKLASH MASHQI (restore drill).
 *
 * "Hech qachon tiklanmagan backup — backup emas, taxmin." Bu skript aynan shu
 * taxminni tekshiradi: backup faylini VAQTINCHALIK bazaga tiklab ko'radi va
 * qatorlar sonini joriy baza bilan solishtiradi.
 *
 * JONLI BAZAGA TEGMAYDI — yangi baza yaratiladi va oxirida o'chiriladi.
 *
 * Ishlatish:
 *   npx tsx scripts/verify-restore.ts                    # joriy bazadan yangi dump olib tekshiradi
 *   npx tsx scripts/verify-restore.ts backups/2026.../db-....sql.gz
 *   BACKUP_ENCRYPTION_KEY='...' npx tsx scripts/verify-restore.ts fayl.sql.gz.enc
 *   npx tsx scripts/verify-restore.ts fayl.gz --fast     # faqat matn tahlili (DB kerak emas)
 *
 * Chiqish kodi: 0 — soz, 1 — muammo (cron/monitoring uchun).
 */
import { readFileSync } from "node:fs";
import { openBackupFile, inspectDump, verifyByRestore, CORE_TABLES } from "../src/lib/restore";
import { db } from "../src/lib/db";

const file = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
const fast = process.argv.includes("--fast");

function fail(msg: string): never {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function liveCounts(): Promise<Record<string, number>> {
  const [users, clients, payments, calls] = await Promise.all([
    db.user.count(),
    db.client.count(),
    db.payment.count(),
    db.callLog.count(),
  ]);
  return { User: users, Client: clients, Payment: payments, CallLog: calls };
}

async function main() {
  console.log("=== BACKUP TIKLASH MASHQI ===\n");

  // 1) Manba: berilgan fayl yoki joriy bazadan yangi dump.
  let data: Buffer;
  if (file) {
    console.log(`Manba: ${file}`);
    try {
      data = readFileSync(file);
    } catch (e) {
      fail(`Fayl o'qilmadi: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    console.log("Manba: joriy bazadan yangi pg_dump olinmoqda...");
    const { createBackup } = await import("../src/lib/backup");
    const res = await createBackup();
    if (!res.ok || !res.name) fail(`Backup olinmadi: ${res.error}`);
    const path = `backups/${res.name}/db-${res.name}.sql.gz`;
    console.log(`  olindi: ${path} (${res.sizeKb} KB)`);
    data = readFileSync(path);
  }

  // 2) Faylni ochish (shifr + gzip) va matn tahlili.
  const opened = openBackupFile(data, { encryptionKey: process.env.BACKUP_ENCRYPTION_KEY });
  if (!opened.ok) fail(opened.error);
  const info = inspectDump(opened.sql);

  console.log(`\nFayl ichida (matn tahlili):`);
  console.log(`  pg_dump versiyasi: ${info.pgDumpVersion ?? "noma'lum"}`);
  for (const t of info.tables.slice(0, 12)) {
    console.log(`  ${t.table.padEnd(24)} ${String(t.rows).padStart(7)} qator`);
  }
  if (info.tables.length > 12) console.log(`  ... yana ${info.tables.length - 12} ta jadval`);
  console.log(`  JAMI: ${info.totalRows} qator`);

  if (info.missingCoreTables.length > 0) {
    fail(`Asosiy jadvallar yo'q: ${info.missingCoreTables.join(", ")}`);
  }

  // 3) Joriy baza bilan solishtirish (fayl joriy bazadan olingan bo'lsa mos kelishi kerak).
  let live: Record<string, number> | null = null;
  try {
    live = await liveCounts();
    console.log(`\nJoriy baza:`);
    for (const t of CORE_TABLES) {
      const inFile = info.tables.find((x) => x.table === t)?.rows ?? 0;
      const mark = live[t] === inFile ? "=" : "≠";
      console.log(`  ${t.padEnd(24)} baza ${String(live[t]).padStart(6)} ${mark} fayl ${String(inFile).padStart(6)}`);
    }
  } catch {
    console.log("\n(joriy bazaga ulanib bo'lmadi — solishtirish o'tkazib yuborildi)");
  }

  if (fast) {
    console.log("\n✅ [--fast] Matn tahlili muvaffaqiyatli. Haqiqiy tiklash sinalmadi.");
    await db.$disconnect();
    return;
  }

  // 4) HAQIQIY tekshiruv: vaqtinchalik bazaga tiklab ko'ramiz.
  console.log("\nVaqtinchalik bazaga tiklab ko'rilmoqda (jonli bazaga tegilmaydi)...");
  const res = await verifyByRestore(opened.sql);

  for (const w of res.warnings) console.log(`  ⚠️  ${w}`);

  if (!res.ok) {
    await db.$disconnect();
    fail(`Tiklash MUVAFFAQIYATSIZ: ${res.error}\n   Bu backup bilan tiklab bo'lmaydi!`);
  }

  console.log("\nTiklangan bazadagi haqiqiy sonlar:");
  for (const a of res.actual ?? []) {
    console.log(`  ${a.table.padEnd(24)} ${String(a.rows).padStart(7)} qator`);
  }

  const mismatch = res.warnings.length > 0;
  console.log(
    mismatch
      ? "\n⚠️  Tiklandi, lekin farqlar bor (yuqoriga qarang)."
      : "\n✅ BACKUP TIKLANADI. Fayl to'liq va ishlaydi.",
  );
  await db.$disconnect();
  process.exit(mismatch ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});

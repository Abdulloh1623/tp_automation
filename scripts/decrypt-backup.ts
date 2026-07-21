/**
 * Telegramdan olingan shifrlangan backupni ochadi.
 *
 *   npx tsx scripts/decrypt-backup.ts db-20260721-093000.sql.gz.enc
 *   npx tsx scripts/decrypt-backup.ts <fayl> --out=dump.sql.gz
 *
 * Kalit `BACKUP_ENCRYPTION_KEY` muhit o'zgaruvchisidan olinadi:
 *   BACKUP_ENCRYPTION_KEY='...' npx tsx scripts/decrypt-backup.ts fayl.enc
 *
 * Natijani tiklash:
 *   gunzip -c dump.sql.gz | psql "$DATABASE_URL"
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decryptBackup } from "../src/lib/backup-crypto";

const file = process.argv[2];
const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6);

if (!file) {
  console.error("Ishlatish: npx tsx scripts/decrypt-backup.ts <fayl.enc> [--out=dump.sql.gz]");
  process.exit(1);
}

const key = process.env.BACKUP_ENCRYPTION_KEY;
if (!key) {
  console.error("XATO: BACKUP_ENCRYPTION_KEY berilmagan.");
  console.error("Masalan: BACKUP_ENCRYPTION_KEY='...' npx tsx scripts/decrypt-backup.ts fayl.enc");
  process.exit(1);
}

const target = out ?? (file.replace(/\.enc$/, "") || "backup.sql.gz");

try {
  const plain = decryptBackup(readFileSync(file), key);
  writeFileSync(target, plain);
  console.log(`Ochildi: ${target} (${Math.round(plain.length / 1024)} KB)`);
  console.log(`Tiklash: gunzip -c ${target} | psql "$DATABASE_URL"`);
} catch (e) {
  // GCM tag mos kelmasa — kalit noto'g'ri yoki fayl buzilgan.
  console.error("Ochib bo'lmadi:", e instanceof Error ? e.message : String(e));
  console.error("Kalit noto'g'ri yoki fayl shikastlangan bo'lishi mumkin.");
  process.exit(1);
}

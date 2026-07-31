/**
 * `uploads/receipts/` dagi EGASIZ chek fayllarini topadi va o'chiradi.
 *
 * NEGA KERAK: Telegram chek qabuli olib tashlanganda `PendingPayment` jadvali
 * bilan birga uning fayllarga bo'lgan yagona havolasi ham yo'qoldi — fayllar
 * esa diskda qolib ketdi. Prod diskining to'lib qolishi allaqachon bir marta
 * bazani yiqitgan, shuning uchun bu axlat yig'ilib qolmasligi kerak.
 *
 * ODATDA FAQAT KO'RSATADI — hech narsa o'chirmaydi. O'chirish uchun `--apply`.
 *
 *   npm run cleanup-orphan-receipts            # ko'rish (xavfsiz)
 *   npm run cleanup-orphan-receipts -- --apply # o'chirish
 *
 * Egasi bor fayl deb quyidagilar hisoblanadi:
 *   - `<paymentId>.<ext>`      → Payment.receiptPath
 *   - `card-<requestId>.<ext>` → PendingCardPayment.receiptPath
 * Qolganlari egasiz. Shubha bo'lsa `--apply` siz ishga tushirib ro'yxatni
 * ko'ring: skript faqat nomi hech bir yozuvga ulanmagan fayllarni sanaydi.
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

const db = new PrismaClient();
const DIR = path.join(process.cwd(), "uploads", "receipts");

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");

  let files: string[];
  try {
    files = await fs.readdir(DIR);
  } catch {
    console.log(`Katalog yo'q: ${DIR} — tozalash kerak emas.`);
    return;
  }

  // Havola qilingan fayl nomlari (relPath = "receipts/<nom>")
  const referenced = new Set<string>();
  for (const table of [
    db.payment.findMany({
      where: { receiptPath: { not: null } },
      select: { receiptPath: true },
    }),
    db.pendingCardPayment.findMany({
      where: { receiptPath: { not: null } },
      select: { receiptPath: true },
    }),
  ]) {
    for (const row of await table) {
      if (row.receiptPath) referenced.add(row.receiptPath.replace(/^receipts\//, ""));
    }
  }

  const orphans: { name: string; size: number }[] = [];
  for (const name of files) {
    if (referenced.has(name)) continue;
    const stat = await fs.stat(path.join(DIR, name)).catch(() => null);
    if (!stat?.isFile()) continue;
    orphans.push({ name, size: stat.size });
  }

  const total = orphans.reduce((s, o) => s + o.size, 0);
  console.log(`Jami fayl: ${files.length} · havolali: ${referenced.size} · egasiz: ${orphans.length} (${mb(total)})`);

  if (orphans.length === 0) return;
  for (const o of orphans.slice(0, 20)) console.log(`  ${o.name} — ${mb(o.size)}`);
  if (orphans.length > 20) console.log(`  … va yana ${orphans.length - 20} ta`);

  if (!apply) {
    console.log("\nHech narsa o'chirilmadi. O'chirish uchun: npm run cleanup-orphan-receipts -- --apply");
    return;
  }

  // XAVFSIZLIK: fayllar bor, lekin BIRORTASI ham havolali emas — bu ko'pincha
  // "bazani ko'rmadim" degani (noto'g'ri DATABASE_URL, bo'sh baza, ishga
  // tushirish katalogi boshqa). Bunday holatda hamma chek egasiz ko'rinadi va
  // skript butun arxivni o'chirib yuborardi. Chek — moliyaviy dalil, shuning
  // uchun ataylab to'xtaymiz.
  if (referenced.size === 0 && files.length > 0 && !process.argv.includes("--force")) {
    console.error(
      "\nTO'XTATILDI: bazada chekka havola qilingan birorta yozuv topilmadi, " +
        "fayllar esa bor. DATABASE_URL to'g'ri ekaniga ishonch hosil qiling.\n" +
        "Haqiqatan ham hammasi egasiz bo'lsa: -- --apply --force",
    );
    process.exitCode = 1;
    return;
  }

  let removed = 0;
  for (const o of orphans) {
    try {
      await fs.unlink(path.join(DIR, o.name));
      removed += 1;
    } catch (e) {
      console.error(`  o'chirilmadi: ${o.name}`, e);
    }
  }
  console.log(`\nO'chirildi: ${removed} ta fayl (${mb(total)}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

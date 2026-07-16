// Tablo (jonli taxta) ko'rsatkichlarini "bugundan" boshlab hisoblash uchun
// `statsResetAt` sozlamasini bugun 00:00 (Asia/Tashkent) ga o'rnatadi.
//
// ✅ MA'LUMOT O'CHIRILMAYDI: CallLog (qo'ng'iroq jurnali / suhbat tarixi) to'liq
//    saqlanadi. Analitika shunchaki shu sanadan oldingi yozuvlarni HISOBGA OLMAYDI,
//    shu bilan haftalik/oylik/jami sonlar bugundan boshlanadi (bugungisi qoladi).
//    Qaytariladi: `--clear --yes` bilan chegara olib tashlanadi (butun tarix qaytadi).
//
// Ishlatish (serverda):
//   docker compose run --rm app npm run reset-board-stats            # DRY: nima bo'lishini ko'rsatadi
//   docker compose run --rm app npm run reset-board-stats -- --yes   # bugun 00:00 ga o'rnatadi
//   docker compose run --rm app npm run reset-board-stats -- --clear --yes  # chegarani olib tashlaydi
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CONFIRMED = process.argv.includes("--yes");
const CLEAR = process.argv.includes("--clear");
const KEY = "statsResetAt";

// Asia/Tashkent — doimiy UTC+5. Bugun 00:00 (Tashkent) ni UTC'da hisoblaymiz.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
function startOfTodayTashkentUtc(): Date {
  const tash = new Date(Date.now() + TASHKENT_OFFSET_MS);
  const midnight = Date.UTC(tash.getUTCFullYear(), tash.getUTCMonth(), tash.getUTCDate(), 0, 0, 0);
  return new Date(midnight - TASHKENT_OFFSET_MS);
}

async function main() {
  const current = await db.appSetting.findUnique({ where: { key: KEY } });
  const cutoff = startOfTodayTashkentUtc();
  const [totalAll, beforeCutoff] = await Promise.all([
    db.callLog.count(),
    db.callLog.count({ where: { calledAt: { lt: cutoff } } }),
  ]);

  console.log("=== Tablo ko'rsatkichlari chegarasi (statsResetAt) ===");
  console.log(`Joriy chegara      : ${current?.value ?? "(yo'q — butun tarix)"}`);
  console.log(`Jami CallLog       : ${totalAll} (HECH BIRI o'chirilmaydi)`);

  if (CLEAR) {
    if (!CONFIRMED) {
      console.log("\nDRY-RUN — chegara olib tashlanmadi. Bajarish: `--clear --yes`.");
      return;
    }
    await db.appSetting.deleteMany({ where: { key: KEY } });
    console.log("✅ Chegara olib tashlandi — tablo butun tarixni qayta hisoblaydi.");
    return;
  }

  console.log(`Yangi chegara      : ${cutoff.toISOString()} (UTC = bugun 00:00 Asia/Tashkent)`);
  console.log(`Chegaradan oldin   : ${beforeCutoff} ta CallLog — SAQLANADI, faqat hisobga olinmaydi`);
  console.log(`Bugungi (hisobda)  : ${totalAll - beforeCutoff} ta CallLog`);

  if (!CONFIRMED) {
    console.log("\nDRY-RUN — chegara o'rnatilmadi. Bajarish uchun `--yes` qo'shing.");
    return;
  }

  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: cutoff.toISOString() },
    update: { value: cutoff.toISOString() },
  });
  console.log("\n✅ Chegara o'rnatildi. Tablo endi haftalik/oylik/jami sonlarni BUGUNDAN ko'rsatadi.");
  console.log("   Qo'ng'iroq jurnali to'liq saqlanib qoldi.");
}

main()
  .catch((e) => {
    console.error("Xatolik:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

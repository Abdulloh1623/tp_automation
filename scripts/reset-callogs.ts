// Bir martalik data-reset: tablo (jonli taxta) ko'rsatkichlari CallLog'dan
// hisoblanadi. Bu skript BUGUNDAN OLDINGI (Asia/Tashkent, 00:00) barcha CallLog
// yozuvlarini o'chiradi — shunda haftalik/oylik/jami sonlar bugundan boshlanadi.
// Bugungi yozuvlar TEGILMAYDI.
//
// ⚠️ QAYTARIB BO'LMAYDI: CallLog o'chirilsa, mijozlarning eski qo'ng'iroq jurnali
//    (suhbat tarixi/izohlar) va "oxirgi gaplashgan operator" ham yo'qoladi.
//    ISHLATISHDAN OLDIN BAZANI BACKUP QILING.
//
// Ishlatish (serverda):
//   docker compose run --rm app npx tsx scripts/reset-callogs.ts          # DRY: faqat sanaydi
//   docker compose run --rm app npx tsx scripts/reset-callogs.ts --yes    # HAQIQATAN o'chiradi
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CONFIRMED = process.argv.includes("--yes");

// Asia/Tashkent — doimiy UTC+5 (yozgi vaqt yo'q). Bugun 00:00 (Tashkent) ni UTC'da hisoblaymiz.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

function startOfTodayTashkentUtc(): Date {
  const nowMs = Date.now();
  const tash = new Date(nowMs + TASHKENT_OFFSET_MS); // Tashkent "devor soati" UTC maydonlarida
  const midnightTashUtc = Date.UTC(
    tash.getUTCFullYear(),
    tash.getUTCMonth(),
    tash.getUTCDate(),
    0,
    0,
    0,
  );
  return new Date(midnightTashUtc - TASHKENT_OFFSET_MS);
}

async function main() {
  const cutoff = startOfTodayTashkentUtc();

  const [totalAll, toDelete, todayKeep] = await Promise.all([
    db.callLog.count(),
    db.callLog.count({ where: { calledAt: { lt: cutoff } } }),
    db.callLog.count({ where: { calledAt: { gte: cutoff } } }),
  ]);

  console.log("=== Tablo natijalarini nollash (CallLog) ===");
  console.log(`Kesim (bugun 00:00 Asia/Tashkent) : ${cutoff.toISOString()} (UTC)`);
  console.log(`Jami CallLog                       : ${totalAll}`);
  console.log(`O'chiriladigan (bugundan oldin)    : ${toDelete}`);
  console.log(`Qoladigan (bugun)                  : ${todayKeep}`);

  if (!CONFIRMED) {
    console.log("");
    console.log("DRY-RUN — hech narsa o'chirilmadi.");
    console.log("Haqiqatan o'chirish uchun: qayta ishga tushiring va oxiriga `--yes` qo'shing.");
    console.log("⚠️ Avval bazani backup qilganingizga ishonch hosil qiling.");
    return;
  }

  const res = await db.callLog.deleteMany({ where: { calledAt: { lt: cutoff } } });
  console.log("");
  console.log(`✅ O'chirildi: ${res.count} ta CallLog. Bugungi ${todayKeep} ta qoldi.`);
  console.log("Tablo endi haftalik/oylik sonlarni bugundan boshlab ko'rsatadi.");
}

main()
  .catch((e) => {
    console.error("Xatolik:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

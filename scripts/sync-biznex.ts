// Fon (qo'lda) skript: har bir mijozning telefon raqamini Biznex bilan
// solishtiradi va Client.biznexStatus / biznexCheckedAt flaglarini yangilaydi.
// "Biznex-da topilmaganlar" va "jim churn" filtrlari shu flagga tayanadi.
//
// Mantiq `src/lib/biznex-sync.ts` da — worker cron'i (har kuni 06:00) ham
// aynan shu yadroni chaqiradi, ya'ni flaglar o'zi yangilanib turadi.
//
// Ishlatish:
//   npm run sync-biznex              # barcha mijozlarni tekshiradi
//   npm run sync-biznex -- --stale   # faqat hali tekshirilmaganlarni (biznexCheckedAt=null)
//   npm run sync-biznex -- --limit=100
//
// .env da BIZNEX_API_URL va BIZNEX_STATIC_TOKEN bo'lishi shart (Keycloak).
import path from "node:path";
import dotenv from "dotenv";

// .env ni loyiha ildizidan aniq yo'l bilan yuklaymiz. `npm run` CWD'ni paket
// ildiziga qo'yadi, lekin boshqa joydan ishga tushirilsa ham topilsin.
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

import { db } from "../src/lib/db";
import { syncBiznex, biznexConfigured } from "../src/lib/biznex-sync";

const STALE = process.argv.includes("--stale");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) || undefined : undefined;

async function main() {
  if (!biznexConfigured()) {
    console.error(
      "XATO: BIZNEX_API_URL va BIZNEX_STATIC_TOKEN loyiha ildizidagi .env da belgilanishi shart.",
    );
    process.exit(1);
  }

  let announced = false;
  const r = await syncBiznex({
    staleOnly: STALE,
    limit: LIMIT,
    onEach: (done, total) => {
      if (!announced) {
        console.log(
          `${total} ta mijoz tekshiriladi${STALE ? " (faqat tekshirilmaganlar)" : ""}...`,
        );
        announced = true;
      }
      if (done % 50 === 0) console.log(`  ${done}/${total}...`);
    },
  });

  console.log(
    `Yakun: ${r.updated} yangilandi · ${r.notFound} topilmadi (NOT_FOUND) · ${r.skipped} o'tkazildi (unknown).`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("XATO:", e);
    await db.$disconnect();
    process.exit(1);
  });

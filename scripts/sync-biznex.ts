// Fon (cron/qo'lda) skript: har bir mijozning telefon raqamini Biznex bilan
// solishtiradi va Client.biznexStatus / biznexCheckedAt flaglarini yangilaydi.
// "Biznex-da topilmaganlar" filtri (/mijozlar?biznex=not_found) shu flagga tayanadi.
//
// Ishlatish:
//   npm run sync-biznex              # barcha mijozlarni tekshiradi
//   npm run sync-biznex -- --stale   # faqat hali tekshirilmaganlarni (biznexCheckedAt=null)
//   npm run sync-biznex -- --limit=100
//
// .env da BIZNEX_API_URL va BIZNEX_STATIC_TOKEN bo'lishi shart (Keycloak).
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getBiznexSubscription, biznexStatusFlag } from "../src/lib/billing";

// .env ni loyiha ildizidan aniq yo'l bilan yuklaymiz. `npm run` CWD'ni paket
// ildiziga qo'yadi, lekin boshqa joydan ishga tushirilsa ham topilsin.
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

const db = new PrismaClient();

const STALE = process.argv.includes("--stale");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) || undefined : undefined;

async function main() {
  if (!process.env.BIZNEX_API_URL || !process.env.BIZNEX_STATIC_TOKEN) {
    console.error(
      "XATO: BIZNEX_API_URL va BIZNEX_STATIC_TOKEN loyiha ildizidagi .env da belgilanishi shart.",
    );
    process.exit(1);
  }

  const clients = await db.client.findMany({
    where: STALE ? { biznexCheckedAt: null } : {},
    select: { id: true, restaurantName: true, phone: true },
    orderBy: { createdAt: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  console.log(
    `${clients.length} ta mijoz tekshiriladi${STALE ? " (faqat tekshirilmaganlar)" : ""}...`,
  );

  const counts = { updated: 0, notFound: 0, skipped: 0 };

  // Ketma-ket (API'ni ehtiyot qilib). Token billing.ts ichida keshlanadi.
  for (const c of clients) {
    const sub = await getBiznexSubscription(c.phone);
    const flag = biznexStatusFlag(sub);

    // "unknown" (API o'chiq/sozlanmagan) — mavjud flagni buzmaymiz.
    if (flag === null) {
      counts.skipped++;
      continue;
    }
    if (flag === "NOT_FOUND") counts.notFound++;

    // Biznex flagi (topilmaganlar filtri uchun) + tekshiruv vaqti — hamisha.
    const data: {
      biznexStatus: string;
      biznexCheckedAt: Date;
      status?: string;
      nextPaymentDate?: Date;
    } = { biznexStatus: flag, biznexCheckedAt: new Date() };

    // Mijoz sahifasidagi "Obuna va to'lov" kartasi lokal `nextPaymentDate` va
    // `status` maydonlariga tayanadi (badge nextPaymentDate'dan hisoblanadi —
    // payment-status.ts). Yuqoridagi jonli Biznex belgisi bilan bir xil bo'lishi
    // uchun Biznex haqiqiy obunasi topilganda (active/expired/inactive) shu
    // billing maydonlarini Biznex ma'lumoti bilan qayta yozamiz. NOT_FOUND /
    // unknown holatida tegmaymiz (telefon Biznex'da yo'q — lokal ma'lumot
    // saqlanadi).
    if (sub.status === "active" || sub.status === "expired" || sub.status === "inactive") {
      // Keyingi to'lov sanasi = Biznex `expiresAt` (aynan qaytarilgan qiymat).
      if (sub.expiresAt) {
        const exp = new Date(sub.expiresAt);
        if (!Number.isNaN(exp.getTime())) data.nextPaymentDate = exp;
      }
      // Lokal obuna holati Biznex faol holatiga moslashtiriladi.
      data.status = sub.active ? "ACTIVE" : "INACTIVE";
    }

    await db.client.update({ where: { id: c.id }, data });
    counts.updated++;
  }

  console.log(
    `Yakun: ${counts.updated} yangilandi · ${counts.notFound} topilmadi (NOT_FOUND) · ${counts.skipped} o'tkazildi (unknown).`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("XATO:", e);
    await db.$disconnect();
    process.exit(1);
  });

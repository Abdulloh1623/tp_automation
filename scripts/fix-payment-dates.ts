// Bir martalik data-fix: nextPaymentDate = null bo'lgan FAOL (ACTIVE/PENDING)
// mijozlarga to'lov sanasini SHARTNOMA sanasidan (bo'lmasa createdAt) hisoblab
// qo'yadi. Server action bilan bir xil `computeNextPaymentDate` mantiqi.
//
// Ishlatish:
//   npm run fix-payment-dates          # o'zgarishlarni yozadi
//   npm run fix-payment-dates -- --dry # faqat ko'rsatadi (yozmaydi)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { computeNextPaymentDate } from "../src/lib/billing";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry");

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const from = new Date(); // joriy billing tsikli (masalan 2026-07)
  const clients = await db.client.findMany({
    where: {
      status: { in: ["ACTIVE", "PENDING"] },
      nextPaymentDate: null,
    },
    select: {
      id: true,
      restaurantName: true,
      status: true,
      contractDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `${clients.length} ta faol/kutilayotgan mijozda nextPaymentDate = null` +
      (DRY ? "  [DRY-RUN — hech nima yozilmaydi]" : ""),
  );

  let updated = 0;
  for (const c of clients) {
    const anchor = c.contractDate ?? c.createdAt;
    const source = c.contractDate ? "shartnoma" : "createdAt";
    const next = computeNextPaymentDate(anchor, from);

    if (!DRY) {
      // Ketma-ket, xavfsiz yangilash (har biri alohida) — katta bitta
      // tranzaksiyaga nisbatan xotira/lock jihatidan xavfsizroq.
      await db.client.update({
        where: { id: c.id },
        data: { nextPaymentDate: next },
      });
    }
    updated++;
    console.log(
      `✓ ${c.restaurantName || "(nomsiz)"} [${c.status}] — ${source} ${ymd(anchor)} → nextPaymentDate ${ymd(next)}`,
    );
  }

  console.log(
    DRY
      ? `Yakun (DRY): ${updated} ta mijoz yangilanishi kerak.`
      : `Yakun: ${updated}/${clients.length} ta mijoz yangilandi.`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("XATO:", e);
    await db.$disconnect();
    process.exit(1);
  });

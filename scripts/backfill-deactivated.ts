// Bir martalik backfill: `deactivatedAt` maydoni yangi qo'shilgani uchun eski
// yo'qotilgan (churn) mijozlarga uni to'ldiradi. Churn belgisi — status INACTIVE
// yoki bosqich REFUSED/DEACTIVATED. Aniq churn vaqti saqlanmagani uchun eng yaqin
// taxmin sifatida `updatedAt` ishlatiladi (moliya trend/churn tarixi uchun).
//
// Ishlatish:
//   npx tsx scripts/backfill-deactivated.ts          # o'zgarishlarni yozadi
//   npx tsx scripts/backfill-deactivated.ts --dry     # faqat ko'rsatadi
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry");

const CHURN_STAGES = ["REFUSED", "DEACTIVATED"];

async function main() {
  // Churn holatida, lekin deactivatedAt hali yo'q mijozlar
  const targets = await db.client.findMany({
    where: {
      deactivatedAt: null,
      OR: [{ status: "INACTIVE" }, { stage: { in: CHURN_STAGES } }],
    },
    select: { id: true, restaurantName: true, status: true, stage: true, updatedAt: true },
  });

  console.log(`Topildi: ${targets.length} ta churn mijoz (deactivatedAt bo'sh)`);
  if (DRY) {
    for (const c of targets.slice(0, 20)) {
      console.log(`  ${c.restaurantName} — ${c.status}/${c.stage} → ${c.updatedAt.toISOString().slice(0, 10)}`);
    }
    if (targets.length > 20) console.log(`  ... va yana ${targets.length - 20} ta`);
    console.log("(--dry) hech narsa yozilmadi.");
    return;
  }

  let done = 0;
  for (const c of targets) {
    await db.client.update({
      where: { id: c.id },
      data: { deactivatedAt: c.updatedAt },
    });
    done += 1;
  }
  console.log(`Yozildi: ${done} ta mijozga deactivatedAt = updatedAt qo'yildi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

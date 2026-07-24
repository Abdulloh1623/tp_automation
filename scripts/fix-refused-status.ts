/**
 * Bir martalik tuzatuv: churn bosqichida (stage REFUSED/DEACTIVATED), lekin
 * status hali ACTIVE bo'lgan mijozlarni INACTIVE ga keltiradi.
 *
 * NEGA kerak: "Faol mijozlar" (Telegram/moliya) `status = "ACTIVE"` bo'yicha,
 * "Otkaz" (/otkaz) esa `stage = "REFUSED"` bo'yicha sanaladi — ular ikki BOSHQA
 * maydon. App orqali otkaz qilinganda IKKALASI ham qo'yiladi (leads.ts), ammo
 * eski rang-bo'yicha import faqat `stage=REFUSED` qo'yib, `status`ni ACTIVE
 * qoldirgan. Natijada bunday mijozlar HAM faolda, HAM otkazda sanalib, faol
 * son + MRR ni shishirgan. Bu skript ularni app otkaz oqimidagidek tekislaydi:
 *   status -> INACTIVE, deactivatedAt (bo'sh bo'lsa) -> updatedAt, assignedToId -> null.
 *
 * deactivatedAt uchun `new Date()` EMAS, `updatedAt` ishlatiladi — churn aslida
 * o'tmishda bo'lgan (moliya trend/churn tarixi buzilmasin). Agar allaqachon
 * to'ldirilgan bo'lsa — tegilmaydi.
 *
 * Ishlatish:
 *   npx tsx scripts/fix-refused-status.ts            # DRY-RUN (faqat ko'rsatadi)
 *   npx tsx scripts/fix-refused-status.ts --commit   # yozadi
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

const CHURN_STAGES = ["REFUSED", "DEACTIVATED"];

async function main() {
  // Churn bosqichida, lekin hamon faol (status=ACTIVE) — nomuvofiq mijozlar.
  const targets = await db.client.findMany({
    where: { status: "ACTIVE", stage: { in: CHURN_STAGES } },
    select: {
      id: true,
      restaurantName: true,
      fullName: true,
      stage: true,
      monthlyAmount: true,
      currency: true,
      deactivatedAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  const byStage = new Map<string, number>();
  let mrrU = 0;
  let mrrZ = 0;
  for (const c of targets) {
    byStage.set(c.stage, (byStage.get(c.stage) ?? 0) + 1);
    c.currency === "UZS" ? (mrrZ += c.monthlyAmount) : (mrrU += c.monthlyAmount);
  }

  console.log("=== Faol bo'lib turgan churn mijozlar (status=ACTIVE + stage REFUSED/DEACTIVATED) ===");
  console.log(`Jami: ${targets.length}`);
  for (const [stage, n] of byStage) console.log(`  ${stage}: ${n}`);
  console.log(`Ular "Faol mijozlar" sonini ${targets.length} taga, MRR ni ~$${mrrU.toFixed(0)}${mrrZ ? ` + ${mrrZ} so'm` : ""} ga shishiryapti.`);

  console.log("\n--- Ro'yxat (birinchi 30) ---");
  for (const c of targets.slice(0, 30)) {
    const name = c.restaurantName?.trim() || c.fullName?.trim() || "(nomsiz)";
    console.log(`  ${name} — ${c.stage} — ${c.monthlyAmount}${c.currency === "UZS" ? " so'm" : "$"} — oxirgi o'zgarish ${c.updatedAt.toISOString().slice(0, 10)}`);
  }
  if (targets.length > 30) console.log(`  ... va yana ${targets.length - 30} ta`);

  if (!COMMIT) {
    console.log("\n[DRY-RUN] Hech nima yozilmadi. Qo'llash uchun: --commit");
    return;
  }

  let done = 0;
  for (const c of targets) {
    await db.client.update({
      where: { id: c.id },
      data: {
        status: "INACTIVE",
        deactivatedAt: c.deactivatedAt ?? c.updatedAt, // churn vaqti (bo'sh bo'lsa)
        assignedToId: null,
      },
    });
    done += 1;
  }
  await db.auditLog.create({
    data: {
      action: "Otkaz/deaktiv bosqichidagi faol mijozlar INACTIVE ga tekislandi",
      entity: "Client",
      detail: `${done} ta (status ACTIVE -> INACTIVE; stage REFUSED/DEACTIVATED)`,
    },
  });
  console.log(`\n[COMMIT] ${done} ta mijoz INACTIVE ga o'tkazildi. "Faol mijozlar" endi ${done} taga kamayadi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

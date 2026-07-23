// Ombor "tarixini" tozalash — HAQIQIY ombor ma'lumotini noldan kiritishdan oldin.
//
// 🗑️ O'CHIRADI:
//    - EquipmentMovement (barcha harakat jurnali: ombor→usta, →brak, qaytarish ...)
//    - InventoryStock    (ombor va usta zaxiralaridagi barcha qoldiq yozuvlari)
//
// ✅ TEGMAYDI (saqlanadi):
//    - EquipmentType         (jihoz turlari + narxlari — UI orqali tahrirlaysiz)
//    - ClientEquipment       (mijozga biriktirilgan jihozlar — ijara/MRR hisobi)
//    - EquipmentReturnRequest (qaytarish arizalari workflow'i)
//
// InventoryStock yozuvlarini o'chirish xavfsiz: app zaxira qo'shilganda
// (adjustStock: findUnique→update|create) yozuvni qayta yaratadi.
//
// Ishlatish:
//   LOKAL (dry-run, faqat ko'rsatadi):  npm run clear-inventory-history
//   LOKAL (bajarish):                   npm run clear-inventory-history -- --yes
//   PROD (serverda, EC2):
//     docker compose run --rm app npm run clear-inventory-history            # DRY
//     docker compose run --rm app npm run clear-inventory-history -- --yes   # bajarish
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CONFIRMED = process.argv.includes("--yes");

async function snapshot() {
  const [equipmentType, inventoryStock, equipmentMovement, clientEquipment, returnRequest] =
    await Promise.all([
      db.equipmentType.count(),
      db.inventoryStock.count(),
      db.equipmentMovement.count(),
      db.clientEquipment.count(),
      db.equipmentReturnRequest.count(),
    ]);
  return { equipmentType, inventoryStock, equipmentMovement, clientEquipment, returnRequest };
}

async function main() {
  const before = await snapshot();

  console.log("=== Ombor tarixini tozalash ===\n");
  console.log("Hozirgi holat:");
  console.log(`  EquipmentMovement (o'chadi) : ${before.equipmentMovement}`);
  console.log(`  InventoryStock    (o'chadi) : ${before.inventoryStock}`);
  console.log(`  EquipmentType     (saqlan.) : ${before.equipmentType}`);
  console.log(`  ClientEquipment   (saqlan.) : ${before.clientEquipment}`);
  console.log(`  ReturnRequest     (saqlan.) : ${before.returnRequest}`);

  if (!CONFIRMED) {
    console.log(
      `\nDRY-RUN — hech narsa o'chirilmadi. Bajarish uchun \`--yes\` qo'shing.\n` +
        `  ${before.equipmentMovement} harakat + ${before.inventoryStock} zaxira yozuvi o'chiriladi.`,
    );
    return;
  }

  const result = await db.$transaction(async (tx) => {
    const mov = await tx.equipmentMovement.deleteMany({});
    const stock = await tx.inventoryStock.deleteMany({});
    return { movements: mov.count, stock: stock.count };
  });

  const after = await snapshot();

  console.log(`\n✅ Tozalandi:`);
  console.log(`  EquipmentMovement o'chirildi : ${result.movements}`);
  console.log(`  InventoryStock    o'chirildi : ${result.stock}`);
  console.log(`\nKeyingi holat (saqlanganlar o'zgarmagan bo'lishi kerak):`);
  console.log(`  EquipmentType   : ${after.equipmentType}  (oldin ${before.equipmentType})`);
  console.log(`  ClientEquipment : ${after.clientEquipment}  (oldin ${before.clientEquipment})`);
  console.log(`  ReturnRequest   : ${after.returnRequest}  (oldin ${before.returnRequest})`);
  console.log(`  InventoryStock  : ${after.inventoryStock}  ✓ 0 bo'lishi kerak`);
  console.log(`  EquipmentMovement: ${after.equipmentMovement}  ✓ 0 bo'lishi kerak`);
  console.log(`\nEndi haqiqiy zaxirani /ombor sahifasidan kiritishingiz mumkin.`);
}

main()
  .catch((e) => {
    console.error("Xatolik:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

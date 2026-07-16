/**
 * Backfill: ijara (RENTAL) mijozlariga uskuna (Monoblok) biriktirish.
 *
 * Muammo: 2-bosqich importida (import-devices-ustalar.ts) sheet'ning device
 * ustunlari aralash (son + narx) bo'lgani uchun faqat TOZA son bo'lgan ~41
 * mijozga ClientEquipment yozildi. Qolgan RENTAL mijozlarda equipmentMode
 * = RENTAL, lekin device yozuvi YO'Q — shu bois profilda uskuna ko'rinmaydi
 * va ombor "mijozlarda" kuzatuvidan tushib qoladi.
 *
 * Bu skript: device yozuvi UMUMAN yo'q RENTAL mijozga Monoblok × monoblokCount
 * (yoki 1) ni RENTAL sifatida biriktiradi.
 *
 * MUHIM:
 *  - Faqat ClientEquipment YARATADI. Ombor/usta zaxirasiga (InventoryStock)
 *    TEGMAYDI — bu tarixiy o'rnatishlar, sklad hisobidan allaqachon chiqib
 *    ketgan (yoki hech qachon tizimда hisoblanmagan).
 *  - Billing (monthlyAmount) ga TEGMAYDI. Ijara — monthlyAmount ICHIDAGI ulush,
 *    alohida qo'shilmaydi (detal/hisobot "shundan uskuna ijarasi" deb ko'rsatadi).
 *  - Idempotent: allaqachon device yozuvi bor mijoz (jumladan toza 41) O'TKAZIB
 *    YUBORILADI. Qayta ishga tushirish xavfsiz.
 *  - monoblokCount ko'pincha 1 (import default) — son TAXMINIY. Aniqроq son
 *    bo'lsa, keyin qo'lda / toza CSV bilan tuzatiladi.
 *
 * Ishlatish:
 *   npx tsx scripts/backfill-rental-equipment.ts            # DRY-RUN (yozmaydi)
 *   npx tsx scripts/backfill-rental-equipment.ts --commit   # yozadi
 */
import { db } from "../src/lib/db";

async function main() {
  const commit = process.argv.includes("--commit");

  // Monoblok texnika turi.
  const types = await db.equipmentType.findMany({
    select: { id: true, name: true, rentalPrice: true },
  });
  const mono = types.find((t) => t.name.toLowerCase().includes("monoblok"));
  if (!mono) {
    console.error("XATO: 'Monoblok' texnika turi topilmadi. Avval Ombor'da qo'shing.");
    process.exit(1);
  }

  // RENTAL mijozlar + mavjud device yozuvlari (borligini tekshirish uchun).
  const clients = await db.client.findMany({
    where: { equipmentMode: "RENTAL" },
    select: {
      id: true,
      restaurantName: true,
      monoblokCount: true,
      currency: true,
      equipmentItems: { select: { id: true, ownership: true, quantity: true } },
    },
  });

  let already = 0;
  let toCreate = 0;
  let totalQty = 0;
  let approxOne = 0; // monoblokCount = 1 (taxminiy) bo'lganlar
  const rentalByCurrency: Record<string, number> = {};
  const createData: { clientId: string; equipmentTypeId: string; quantity: number; ownership: string }[] = [];
  const preview: string[] = [];

  for (const c of clients) {
    // Device yozuvi (har qanday egalik) bor bo'lsa — o'tkazib yuboramiz.
    if (c.equipmentItems.length > 0) {
      already++;
      continue;
    }
    const qty = c.monoblokCount && c.monoblokCount > 0 ? c.monoblokCount : 1;
    if (qty === 1) approxOne++;
    toCreate++;
    totalQty += qty;
    const cur = c.currency === "UZS" ? "UZS" : "USD";
    rentalByCurrency[cur] = (rentalByCurrency[cur] ?? 0) + qty * mono.rentalPrice;
    createData.push({ clientId: c.id, equipmentTypeId: mono.id, quantity: qty, ownership: "RENTAL" });
    if (preview.length < 15) preview.push(`  ${c.restaurantName} — Monoblok ×${qty}`);
  }

  console.log("=== IJARA USKUNA BACKFILL ===");
  console.log(`Monoblok turi: "${mono.name}" (ijara narxi: ${mono.rentalPrice}/oy)`);
  console.log(`RENTAL mijozlar jami: ${clients.length}`);
  console.log(`  device yozuvi bor (o'tkazildi): ${already}`);
  console.log(`  yangi biriktiriladi:            ${toCreate}  (${totalQty} dona Monoblok)`);
  console.log(`  shundan monoblokCount=1 (taxminiy): ${approxOne}`);
  console.log(
    "Qo'shiladigan ijara ulushi (ma'lumot uchun): " +
      Object.entries(rentalByCurrency)
        .map(([k, v]) => `${v.toLocaleString("en-US")} ${k}/oy`)
        .join(" + "),
  );
  console.log("Namuna (dastlabki 15):");
  console.log(preview.join("\n") || "  (yo'q)");

  if (!commit) {
    console.log("\n[DRY-RUN] Hech nima yozilmadi. Yozish uchun: --commit");
    await db.$disconnect();
    return;
  }

  if (createData.length === 0) {
    console.log("\n[COMMIT] Biriktiriladigan mijoz yo'q — hammasi joyida.");
    await db.$disconnect();
    return;
  }

  // Bitta createMany — unique (clientId, equipmentTypeId, ownership) buzilmaydi,
  // chunki faqat device yozuvi UMUMAN yo'q mijozlarга yozamiz.
  const res = await db.clientEquipment.createMany({ data: createData });
  await db.auditLog.create({
    data: {
      action: "Backfill: ijara uskunasi biriktirildi",
      entity: "Client",
      detail: `${res.count} mijozga Monoblok (jami ${totalQty} dona) — tarixiy ijara`,
    },
  });
  console.log(`\n[COMMIT] Bajarildi: ${res.count} yozuv yaratildi.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

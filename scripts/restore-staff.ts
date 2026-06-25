/**
 * Tiklash (1-bosqich): xodimlar roster'ini qayta yaratadi va demo mijozlarni tozalaydi.
 * Baza reset bo'lganda o'chgan haqiqiy roster (foydalanuvchi bergan ro'yxat) tiklanadi.
 *
 *   npx tsx scripts/restore-staff.ts            # dry-run (hisobot)
 *   npx tsx scripts/restore-staff.ts --commit   # bajarish
 *
 * Barcha parol: parol123. Keyin import-sheet/devices/comments ishga tushiriladi.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const PASS = "parol123";

const OPERATORS = [
  { username: "javohir", name: "Javohir" },
  { username: "biloliddin", name: "Biloliddin" },
  { username: "abdulla", name: "Abdulla" },
  { username: "mehroj", name: "Mehroj (kechki smena)" },
];

const USTALAR = [
  { username: "abbos", name: "Abbos", regions: ["Surxondaryo", "Buxoro", "Qashqadaryo"], phone: "+998993449801" },
  { username: "ismoil", name: "Ismoil", regions: ["Farg'ona", "Andijon", "Namangan"], phone: "+998910540703" },
  { username: "suxrob", name: "Suxrob", regions: ["Toshkent", "Surxondaryo"], phone: "+998500150005" },
  { username: "anvar", name: "Anvar", regions: ["Samarqand", "Jizzax"], phone: "+998995940340" },
  { username: "azamat", name: "Azamat", regions: ["Qoraqalpog'iston", "Xorazm"], phone: "+998885156868" },
  { username: "shuhrat", name: "Shuhrat", regions: ["Navoiy"], phone: "+998976772301" },
  { username: "hojiakbar", name: "Hojiakbar", regions: ["Toshkent"], phone: "+998777084440" },
];

// Roster'da yo'q demo xodimlar (admin/boshliq qoladi; suxrob ustaga aylanadi)
const DEMO_REMOVE = ["asadbek", "bekzod"];

async function main() {
  const commit = process.argv.includes("--commit");
  const hash = bcrypt.hashSync(PASS, 10);

  const clientCount = await db.client.count();
  const before = await db.user.findMany({ select: { username: true, name: true, role: true, isActive: true } });

  console.log("=== HOZIRGI HOLAT ===");
  console.log("Mijozlar:", clientCount);
  console.log("Xodimlar:", before.map((u) => `${u.role}:${u.username}`).join(", "));
  console.log("\n=== REJA ===");
  console.log(`- Barcha ${clientCount} demo mijoz o'chiriladi (toza import uchun)`);
  console.log(`- Demo xodim o'chiriladi: ${DEMO_REMOVE.join(", ")}`);
  console.log(`- Operator yaratiladi: ${OPERATORS.map((o) => o.username).join(", ")}`);
  console.log(`- Usta yaratiladi/yangilanadi: ${USTALAR.map((u) => u.username).join(", ")}`);
  console.log("- Saqlanadi: admin (ADMIN), boshliq (MANAGER)");

  if (!commit) {
    console.log("\n[DRY-RUN] --commit bering.");
    await db.$disconnect();
    return;
  }

  if (clientCount > 60) {
    console.log(`\n[XAVFSIZLIK] ${clientCount} mijoz bor — import allaqachon bo'lgan bo'lishi mumkin. To'xtatildi.`);
    await db.$disconnect();
    return;
  }

  // 1) Demo mijozlarni tozalash (callLog/payment/equipment/phone kaskad o'chadi)
  const delC = await db.client.deleteMany({});
  console.log(`\n[1] Mijozlar o'chirildi: ${delC.count}`);

  // 2) Roster'da yo'q demo xodimlarni o'chirish
  const delU = await db.user.deleteMany({ where: { username: { in: DEMO_REMOVE } } });
  console.log(`[2] Demo xodim o'chirildi: ${delU.count}`);

  // 3) Operatorlar
  for (const o of OPERATORS) {
    await db.user.upsert({
      where: { username: o.username },
      create: { username: o.username, name: o.name, passwordHash: hash, role: "OPERATOR", isActive: true },
      update: { name: o.name, role: "OPERATOR", isActive: true },
    });
  }
  console.log(`[3] Operator: ${OPERATORS.length} ta tayyor`);

  // 4) Ustalar (INSTALLER) — viloyat + telefon bilan
  for (const u of USTALAR) {
    await db.user.upsert({
      where: { username: u.username },
      create: {
        username: u.username,
        name: u.name,
        passwordHash: hash,
        role: "INSTALLER",
        region: u.regions[0],
        regions: u.regions.join(","),
        phone: u.phone,
        isActive: true,
      },
      update: {
        name: u.name,
        role: "INSTALLER",
        region: u.regions[0],
        regions: u.regions.join(","),
        phone: u.phone,
        isActive: true,
      },
    });
  }
  console.log(`[4] Usta: ${USTALAR.length} ta tayyor`);

  await db.auditLog.create({
    data: {
      action: "Xodimlar roster'i tiklandi (baza reset'idan keyin)",
      entity: "User",
      detail: `operatorlar: ${OPERATORS.length}, ustalar: ${USTALAR.length}; demo mijozlar tozalandi: ${delC.count}`,
    },
  });

  const after = await db.user.findMany({
    where: { isActive: true },
    select: { username: true, name: true, role: true, regions: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  console.log("\n=== YANGI ROSTER ===");
  for (const u of after) console.log(`  ${u.role} | ${u.name} | ${u.username}${u.regions ? " | " + u.regions : ""}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

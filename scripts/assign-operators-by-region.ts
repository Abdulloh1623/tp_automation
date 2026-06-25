/**
 * Mijozlarni operatorlarga HUDUD bo'yicha biriktiradi (foydalanuvchi bergan mapping).
 *   npx tsx scripts/assign-operators-by-region.ts            # dry-run
 *   npx tsx scripts/assign-operators-by-region.ts --commit
 * Hududsiz mijozlar biriktirilmaydi.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const MAP: Record<string, string[]> = {
  biloliddin: ["Toshkent"],
  javohir: ["Andijon", "Farg'ona", "Namangan"],
  abdulla: ["Surxondaryo", "Qashqadaryo", "Jizzax", "Sirdaryo", "Xorazm"],
  mehroj: ["Buxoro", "Navoiy", "Samarqand", "Qoraqalpog'iston"],
};

async function main() {
  const commit = process.argv.includes("--commit");

  const ops = await db.user.findMany({
    where: { username: { in: Object.keys(MAP) } },
    select: { id: true, username: true, name: true },
  });
  const byUsername = new Map(ops.map((o) => [o.username, o]));

  for (const u of Object.keys(MAP)) {
    if (!byUsername.has(u)) {
      console.log(`[XATO] Operator topilmadi: ${u} — to'xtatildi.`);
      await db.$disconnect();
      return;
    }
  }

  console.log("=== REJA (hudud bo'yicha biriktirish) ===");
  let planned = 0;
  for (const [username, regions] of Object.entries(MAP)) {
    const cnt = await db.client.count({ where: { region: { in: regions } } });
    planned += cnt;
    console.log(`  ${byUsername.get(username)!.name.padEnd(22)} ← ${regions.join(", ")} (${cnt})`);
  }
  const noRegion = await db.client.count({ where: { OR: [{ region: null }, { region: "" }] } });
  console.log(`  (hududsiz, biriktirilmaydi): ${noRegion}`);
  console.log(`  Jami biriktiriladi: ${planned}`);

  if (!commit) {
    console.log("\n[DRY-RUN] --commit bering.");
    await db.$disconnect();
    return;
  }

  let total = 0;
  for (const [username, regions] of Object.entries(MAP)) {
    const op = byUsername.get(username)!;
    const r = await db.client.updateMany({
      where: { region: { in: regions } },
      data: { assignedToId: op.id },
    });
    total += r.count;
    console.log(`[OK] ${op.name}: ${r.count} mijoz biriktirildi`);
  }

  await db.auditLog.create({
    data: {
      action: "Mijozlar operatorlarga hudud bo'yicha biriktirildi",
      entity: "Client",
      detail: `jami: ${total}; ${Object.entries(MAP).map(([u, r]) => `${u}:${r.join("/")}`).join(" | ")}`,
    },
  });

  const assigned = await db.client.count({ where: { assignedToId: { not: null } } });
  const unassigned = await db.client.count({ where: { assignedToId: null } });
  console.log(`\n[YAKUN] Biriktirildi: ${total}. Jami biriktirilgan: ${assigned}, biriktirilmagan: ${unassigned}.`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

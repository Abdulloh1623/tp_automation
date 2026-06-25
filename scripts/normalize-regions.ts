/**
 * Bir martalik: mavjud mijozlarning region qiymatlarini kanonik ko'rinishga keltiradi.
 * Ishlatish: npx tsx scripts/normalize-regions.ts [--commit]
 */
import { PrismaClient } from "@prisma/client";
import { normalizeRegion } from "../src/lib/constants";

const db = new PrismaClient();

(async () => {
  const commit = process.argv.includes("--commit");
  const clients = await db.client.findMany({ select: { id: true, region: true } });
  const changes: { id: string; from: string | null; to: string | null }[] = [];
  for (const c of clients) {
    const to = normalizeRegion(c.region);
    if (to !== c.region) changes.push({ id: c.id, from: c.region, to });
  }
  const summary = new Map<string, number>();
  for (const ch of changes) {
    const k = `${JSON.stringify(ch.from)} -> ${JSON.stringify(ch.to)}`;
    summary.set(k, (summary.get(k) ?? 0) + 1);
  }
  console.log("O'zgaradigan yozuvlar:", changes.length);
  for (const [k, n] of summary) console.log(`  ${k}: ${n}`);

  if (!commit) {
    console.log("\n[DRY-RUN] --commit bering.");
    await db.$disconnect();
    return;
  }
  for (const ch of changes) {
    await db.client.update({ where: { id: ch.id }, data: { region: ch.to } });
  }
  console.log(`\n[OK] ${changes.length} yozuv yangilandi.`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

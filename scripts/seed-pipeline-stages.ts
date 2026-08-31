/**
 * Har pipeline uchun mavjud (qattiq kodlangan) ORTADAGI bosqichlarni
 * `PipelineStage` jadvaliga bir martalik seed qiladi — Ticket.status/
 * EquipmentReturnRequest.status'dagi haqiqiy DB qiymatlari o'zgarmaydi,
 * faqat endi ularning nomi shu jadvaldan (admin tahrirlay oladigan)
 * o'qiladi. Idempotent — mavjud (pipeline,key) juftligini qayta yozmaydi.
 *
 *   npx tsx scripts/seed-pipeline-stages.ts            # dry-run
 *   npx tsx scripts/seed-pipeline-stages.ts --commit
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEFAULTS: { pipeline: string; key: string; label: string; order: number }[] = [
  { pipeline: "MUAMMOLAR", key: "IN_PROGRESS", label: "Jarayonda", order: 0 },
  { pipeline: "VERSIYA", key: "IN_PROGRESS", label: "Jarayonda", order: 0 },
  { pipeline: "ESKALATSIYA", key: "EN_ROUTE", label: "Yo'ldaman", order: 0 },
  { pipeline: "ESKALATSIYA", key: "ARRIVED", label: "Bordim", order: 1 },
  { pipeline: "QAYTARISH", key: "IN_PROGRESS", label: "Jarayonda", order: 0 },
];

async function main() {
  const commit = process.argv.includes("--commit");

  const existing = await db.pipelineStage.findMany();
  const has = new Set(existing.map((s) => `${s.pipeline}:${s.key}`));
  const toInsert = DEFAULTS.filter((d) => !has.has(`${d.pipeline}:${d.key}`));

  console.log(`=== REJA: ${toInsert.length} yangi bosqich qo'shiladi (${DEFAULTS.length - toInsert.length} allaqachon bor) ===`);
  for (const d of toInsert) console.log(`  ${d.pipeline} — ${d.label} (${d.key})`);

  if (!commit) {
    console.log("\n[DRY-RUN] --commit bering.");
    await db.$disconnect();
    return;
  }

  for (const d of toInsert) {
    await db.pipelineStage.create({ data: d });
  }
  console.log(`\n[YAKUN] ${toInsert.length} bosqich qo'shildi.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

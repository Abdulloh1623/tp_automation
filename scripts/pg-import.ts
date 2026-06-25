// JSON → PostgreSQL import (provider postgresql'ga o'tgach). ID/sana/aloqalar saqlanadi.
// FK tartibi: user/equipmentType → client → bog'liqlar.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();

// ISO sana satrlarini Date'ga qaytaradi (Prisma DateTime uchun)
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function reviver(_key: string, value: unknown) {
  if (typeof value === "string" && ISO.test(value)) return new Date(value);
  return value;
}

const ORDER = [
  "user",
  "equipmentType",
  "client",
  "clientPhone",
  "payment",
  "callLog",
  "ticket",
  "clientEquipment",
  "inventoryStock",
  "equipmentMovement",
  "equipmentReturnRequest",
  "dailyLeadGrant",
  "auditLog",
] as const;

async function main() {
  const raw = readFileSync("scripts/_migration-data.json", "utf8");
  const data = JSON.parse(raw, reviver) as Record<string, Record<string, unknown>[]>;

  // Xavfsizlik: maqsad baza bo'sh bo'lishi kerak (tasodifan ustiga yozmaslik)
  const existing = await db.user.count();
  if (existing > 0) {
    console.log(`[XATO] Postgres'da allaqachon ${existing} foydalanuvchi bor — import to'xtatildi.`);
    await db.$disconnect();
    return;
  }

  for (const model of ORDER) {
    const rows = data[model] ?? [];
    if (rows.length === 0) {
      console.log(`  ${model}: 0 (o'tkazib yuborildi)`);
      continue;
    }
    const res = await (
      db as unknown as Record<string, { createMany: (a: unknown) => Promise<{ count: number }> }>
    )[model].createMany({ data: rows });
    console.log(`  ${model}: ${res.count}`);
  }
  console.log("Import yakunlandi.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));

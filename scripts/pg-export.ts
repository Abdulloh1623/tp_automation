// SQLite → JSON eksport (Postgresga ko'chirishdan oldin). Hali sqlite provider'da ishlaydi.
// ID, sana, aloqalar saqlanadi. Natija: scripts/_migration-data.json
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const db = new PrismaClient();

async function main() {
  const data: Record<string, unknown[]> = {
    user: await db.user.findMany(),
    equipmentType: await db.equipmentType.findMany(),
    client: await db.client.findMany(),
    clientPhone: await db.clientPhone.findMany(),
    payment: await db.payment.findMany(),
    callLog: await db.callLog.findMany(),
    ticket: await db.ticket.findMany(),
    clientEquipment: await db.clientEquipment.findMany(),
    inventoryStock: await db.inventoryStock.findMany(),
    equipmentMovement: await db.equipmentMovement.findMany(),
    equipmentReturnRequest: await db.equipmentReturnRequest.findMany(),
    dailyLeadGrant: await db.dailyLeadGrant.findMany(),
    auditLog: await db.auditLog.findMany(),
  };
  writeFileSync("scripts/_migration-data.json", JSON.stringify(data, null, 0), "utf8");
  console.log("Eksport qilindi → scripts/_migration-data.json");
  for (const [k, v] of Object.entries(data)) console.log(`  ${k}: ${v.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));

import { db } from "../src/lib/db";

async function main() {
  const [
    totalClients,
    byStatus,
    withPhone,
    assigned,
    phones,
    operators,
    ustalar,
    callLogs,
    clientEquipment,
  ] = await Promise.all([
    db.client.count(),
    db.client.groupBy({ by: ["status"], _count: true }),
    db.client.count({ where: { NOT: { phone: "" } } }),
    db.client.count({ where: { assignedToId: { not: null } } }),
    db.clientPhone.count(),
    db.user.count({ where: { role: "OPERATOR" } }),
    db.user.count({ where: { role: "INSTALLER" } }),
    db.callLog.count(),
    db.clientEquipment.count(),
  ]);

  console.log("JAMI mijozlar:", totalClients);
  console.log("Status bo'yicha:", byStatus.map((s) => `${s.status}=${s._count}`).join(", "));
  console.log("Telefon raqamli:", withPhone);
  console.log("Operatorga biriktirilgan:", assigned);
  console.log("Qo'shimcha telefonlar (ClientPhone):", phones);
  console.log("Operatorlar:", operators, "| Ustalar:", ustalar);
  console.log("CallLog (izoh/qo'ng'iroq):", callLogs);
  console.log("ClientEquipment (uskuna):", clientEquipment);

  const sample = await db.client.findMany({
    take: 12,
    orderBy: { createdAt: "desc" },
    select: { restaurantName: true, fullName: true, region: true, phone: true },
  });
  console.log("\nOxirgi 12 mijoz:");
  for (const c of sample) {
    console.log(`  - ${c.restaurantName || "(restoran yo'q)"} | ${c.fullName || "-"} | ${c.region || "-"} | ${c.phone || "-"}`);
  }
}

main().finally(() => process.exit(0));

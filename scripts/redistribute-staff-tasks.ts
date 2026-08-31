/**
 * Bitta TP xodimga (masalan Biloliddin) biriktirilgan hal qilinmagan
 * muammo/eskalatsiya/qaytarish vazifalarini qolgan faol operatorlar
 * o'rtasida teng (round-robin) qayta taqsimlaydi. Usta (INSTALLER)
 * tomonidagi biriktiruvlarga (assignedUstaId/ustaId) tegilmaydi — faqat
 * TP xodim mas'ulligi (assignedStaffId/escalationStaffId/staffId).
 *
 *   npx tsx scripts/redistribute-staff-tasks.ts biloliddin            # dry-run
 *   npx tsx scripts/redistribute-staff-tasks.ts biloliddin --commit    # bajarish
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type Item = {
  kind: "TICKET" | "ESCALATION" | "RETURN";
  id: string;
  label: string;
};

async function main() {
  const fromUsername = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!fromUsername) {
    console.log("Foydalanish: npx tsx scripts/redistribute-staff-tasks.ts <username> [--commit]");
    await db.$disconnect();
    return;
  }

  const from = await db.user.findUnique({ where: { username: fromUsername } });
  if (!from) {
    console.log(`[XATO] Xodim topilmadi: ${fromUsername}`);
    await db.$disconnect();
    return;
  }

  const recipients = await db.user.findMany({
    where: { role: "OPERATOR", isActive: true, id: { not: from.id } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true },
  });
  if (recipients.length === 0) {
    console.log("[XATO] Qayta taqsimlash uchun boshqa faol operator topilmadi.");
    await db.$disconnect();
    return;
  }

  const [tickets, escalations, returns] = await Promise.all([
    db.ticket.findMany({
      where: { assignedStaffId: from.id, status: { not: "RESOLVED" } },
      select: { id: true, title: true, type: true, client: { select: { restaurantName: true } } },
    }),
    db.client.findMany({
      where: { escalationStaffId: from.id, stage: { in: ["ESCALATED", "FORWARDED"] } },
      select: { id: true, restaurantName: true, stage: true },
    }),
    db.equipmentReturnRequest.findMany({
      where: { staffId: from.id, status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } },
      select: { id: true, status: true, client: { select: { restaurantName: true } } },
    }),
  ]);

  const items: Item[] = [
    ...tickets.map((t) => ({
      kind: "TICKET" as const,
      id: t.id,
      label: `[Muammo/${t.type}] ${t.client.restaurantName} — ${t.title}`,
    })),
    ...escalations.map((c) => ({
      kind: "ESCALATION" as const,
      id: c.id,
      label: `[Eskalatsiya/${c.stage}] ${c.restaurantName}`,
    })),
    ...returns.map((r) => ({
      kind: "RETURN" as const,
      id: r.id,
      label: `[Qaytarish/${r.status}] ${r.client.restaurantName}`,
    })),
  ];

  if (items.length === 0) {
    console.log(`[YAKUN] ${from.name} (${from.username})ga hal qilinmagan vazifa biriktirilmagan — qayta taqsimlash kerak emas.`);
    await db.$disconnect();
    return;
  }

  const plan = items.map((item, i) => ({ item, to: recipients[i % recipients.length] }));

  console.log(`=== REJA: ${from.name} (${from.username}) — ${items.length} vazifa ===`);
  console.log(`Qabul qiluvchilar: ${recipients.map((r) => r.name).join(", ")}`);
  for (const r of recipients) {
    const mine = plan.filter((p) => p.to.id === r.id);
    console.log(`\n${r.name} (${mine.length} ta):`);
    for (const p of mine) console.log(`  - ${p.item.label}`);
  }

  if (!commit) {
    console.log("\n[DRY-RUN] --commit bering.");
    await db.$disconnect();
    return;
  }

  for (const { item, to } of plan) {
    if (item.kind === "TICKET") {
      await db.ticket.update({ where: { id: item.id }, data: { assignedStaffId: to.id } });
    } else if (item.kind === "ESCALATION") {
      await db.client.update({ where: { id: item.id }, data: { escalationStaffId: to.id } });
    } else {
      await db.equipmentReturnRequest.update({ where: { id: item.id }, data: { staffId: to.id } });
    }
  }

  await db.auditLog.create({
    data: {
      action: "TP xodim vazifalari qayta taqsimlandi (skript)",
      entity: "User",
      entityId: from.id,
      detail: `${from.name} dan ${items.length} vazifa (${tickets.length} muammo, ${escalations.length} eskalatsiya, ${returns.length} qaytarish) ${recipients.map((r) => r.name).join(", ")} o'rtasida taqsimlandi`,
    },
  });

  console.log(`\n[YAKUN] ${items.length} vazifa qayta taqsimlandi.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

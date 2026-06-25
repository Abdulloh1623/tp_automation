// Eslatma MATNINI tekshirish (Telegram YUBORMAYDI — faqer build funksiyalari).
import { PrismaClient } from "@prisma/client";
import { buildManagerSummary, buildOperatorReminder } from "../src/lib/reminders";

const db = new PrismaClient();

async function main() {
  console.log("=== BOSHLIQ XULOSASI ===");
  console.log(await buildManagerSummary());

  // Operator eslatmasini sinash uchun javohir mijoziga vaqtincha sana qo'yamiz
  const op = await db.user.findUnique({ where: { username: "javohir" }, select: { id: true, name: true } });
  if (!op) { console.log("javohir yo'q"); return; }
  const cl = await db.client.findFirst({ where: { assignedToId: op.id }, select: { id: true, nextContactDate: true, nextPaymentDate: true } });
  if (!cl) { console.log("javohir mijozi yo'q"); return; }

  const orig = { c: cl.nextContactDate, p: cl.nextPaymentDate };
  await db.client.update({
    where: { id: cl.id },
    data: { nextContactDate: new Date(), nextPaymentDate: new Date(Date.now() - 12 * 86400000) },
  });

  console.log("\n=== OPERATOR ESLATMASI (Javohir) ===");
  console.log(await buildOperatorReminder(op.id, op.name));

  // tiklash
  await db.client.update({ where: { id: cl.id }, data: { nextContactDate: orig.c, nextPaymentDate: orig.p } });
  console.log("\n(test mijoz sanalari tiklandi)");
}

main().finally(() => process.exit(0));

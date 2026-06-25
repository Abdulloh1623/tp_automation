// Kunlik random taqsimot testi — distributeLeadsCore 2 marta (random + ≤50/op).
import { PrismaClient } from "@prisma/client";
import { distributeLeadsCore } from "../src/lib/leads-distribution";

const db = new PrismaClient();

async function snapshot(): Promise<string> {
  const g = await db.client.groupBy({
    by: ["assignedToId"],
    where: { assignedToId: { not: null } },
    _count: true,
  });
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const nm = new Map(users.map((u) => [u.id, u.name]));
  return g
    .map((x) => `${nm.get(x.assignedToId as string) ?? x.assignedToId}=${x._count}`)
    .sort()
    .join("  ");
}

async function main() {
  console.log("1-taqsimot:", await distributeLeadsCore());
  const s1 = await snapshot();
  console.log("   ", s1);
  console.log("2-taqsimot:", await distributeLeadsCore());
  const s2 = await snapshot();
  console.log("   ", s2);
  console.log("\nRandom (2 marta farq qiladimi):", s1 !== s2 ? "HA ✓" : "yo'q (bir xil)");
}

main().catch((e) => console.error("XATO:", e)).finally(() => db.$disconnect());

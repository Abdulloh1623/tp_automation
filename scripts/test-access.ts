// Egalik nazorati (IDOR himoyasi) testi — DB o'zgartirmaydi.
import { PrismaClient } from "@prisma/client";
import { canMutateClient, resolveAssignee } from "../src/lib/access";

const db = new PrismaClient();
const sess = (userId: string, role: string) => ({ userId, role, name: "" } as { userId: string; role: string; name: string });

async function main() {
  const bilo = await db.user.findUnique({ where: { username: "biloliddin" }, select: { id: true } });
  const jav = await db.user.findUnique({ where: { username: "javohir" }, select: { id: true } });
  const admin = await db.user.findUnique({ where: { username: "admin" }, select: { id: true } });
  if (!bilo || !jav || !admin) { console.log("xodimlar topilmadi"); return; }

  const owned = await db.client.findFirst({ where: { assignedToId: bilo.id }, select: { id: true, restaurantName: true } });
  const unassigned = await db.client.findFirst({ where: { assignedToId: null }, select: { id: true } });
  if (!owned) { console.log("biloliddin mijozi yo'q"); return; }

  console.log("Mijoz (Biloliddinники):", owned.restaurantName);
  console.log("--- canMutateClient ---");
  console.log("  Biloliddin (egasi) →", await canMutateClient(sess(bilo.id, "OPERATOR") as any, owned.id), "(kutilgan: true)");
  console.log("  Javohir (boshqa op) →", await canMutateClient(sess(jav.id, "OPERATOR") as any, owned.id), "(kutilgan: false)");
  console.log("  Admin →", await canMutateClient(sess(admin.id, "ADMIN") as any, owned.id), "(kutilgan: true)");
  if (unassigned) console.log("  Javohir → biriktirilmagan mijoz →", await canMutateClient(sess(jav.id, "OPERATOR") as any, unassigned.id), "(kutilgan: false)");
  console.log("  yo'q id →", await canMutateClient(sess(jav.id, "OPERATOR") as any, "yoq_id_123"), "(kutilgan: false)");

  console.log("--- resolveAssignee ---");
  console.log("  OPERATOR(jav) boshqa(bilo) berdi →", await resolveAssignee(sess(jav.id, "OPERATOR") as any, bilo.id), "(kutilgan: javohir id =", jav.id + ")");
  console.log("  ADMIN axlat id berdi →", await resolveAssignee(sess(admin.id, "ADMIN") as any, "axlat_id"), "(kutilgan: null)");
  console.log("  ADMIN to'g'ri op berdi →", await resolveAssignee(sess(admin.id, "ADMIN") as any, jav.id), "(kutilgan: javohir id)");
}

main().catch((e) => console.error("XATO:", e)).finally(() => db.$disconnect());

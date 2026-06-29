// Prod uchun birinchi ADMIN foydalanuvchini yaratadi/yangilaydi (idempotent — bazani TOZALAMAYDI).
// Ishlatish:  ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run create-admin
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrator";

  if (!password) {
    console.error("XATO: ADMIN_PASSWORD muhit o'zgaruvchisi kerak.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("XATO: ADMIN_PASSWORD kamida 8 belgidan iborat bo'lsin.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.upsert({
    where: { username },
    update: { passwordHash, role: "ADMIN", isActive: true, name },
    create: { username, passwordHash, role: "ADMIN", name },
  });
  console.log(`Admin tayyor: ${user.username} (${user.role}). Endi shu login bilan kiring.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

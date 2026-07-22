// Integratsion testlardan OLDIN (bir marta) test bazasiga migratsiyalarni
// qo'llaydi. Shunda sxema o'zgargach `tp_test` ni qo'lda yangilash unutilsa ham
// testlar "column does not exist" bilan yiqilmaydi (lokal DX). CI'da
// migratsiyalar odatda allaqachon qo'llangan bo'ladi — `migrate deploy`
// idempotent, shuning uchun zararsiz qayta ishlaydi.
//
// DATABASE_URL vitest.integration.config.ts tomonidan `.env.test` dan
// process.env ga yuklangan bo'ladi; u yo'q bo'lsa jimgina o'tkazib yuboramiz.
import { execSync } from "node:child_process";

export default function setup(): void {
  if (!process.env.DATABASE_URL) return;
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}

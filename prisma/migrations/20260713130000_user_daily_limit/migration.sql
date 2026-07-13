-- User.dailyLimit ustuni schema'ga qo'shilgan edi (operator kunlik biriktirish
-- kvotasi), lekin migratsiyasi yaratilmagan (lokalda `prisma db push`). Prod
-- DB'da ustun yo'q edi → Prisma `create`ning RETURNING qismi mavjud bo'lmagan
-- ustunga urilib "Xodim qo'shish" xatosini berardi. Bu migratsiya shuni tuzatadi.
-- Idempotent (IF NOT EXISTS): lokal dev DB'da ustun allaqachon bo'lishi mumkin.
-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER NOT NULL DEFAULT 20;

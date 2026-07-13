-- Bitta account = bitta faol qurilma. Har kirishда bu qiymat oshiriladi va
-- JWT'ga yoziladi; eski qurilmaning token versiyasi mos kelmay qolib chiqariladi.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

/*
  Warnings:

  - You are about to drop the `PendingPayment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PendingPayment" DROP CONSTRAINT "PendingPayment_resolvedById_fkey";

-- DropForeignKey
ALTER TABLE "PendingPayment" DROP CONSTRAINT "PendingPayment_suggestedClientId_fkey";

-- DropTable
DROP TABLE "PendingPayment";

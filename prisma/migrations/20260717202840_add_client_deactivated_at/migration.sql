-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Client_deactivatedAt_idx" ON "Client"("deactivatedAt");

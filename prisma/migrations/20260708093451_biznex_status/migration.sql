-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "biznexCheckedAt" TIMESTAMP(3),
ADD COLUMN     "biznexStatus" TEXT;

-- CreateIndex
CREATE INDEX "Client_biznexStatus_idx" ON "Client"("biznexStatus");

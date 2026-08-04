-- AlterTable
ALTER TABLE "EquipmentReturnRequest" ADD COLUMN     "inProgressAt" TIMESTAMP(3),
ADD COLUMN     "slaNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE INDEX "EquipmentReturnRequest_staffId_idx" ON "EquipmentReturnRequest"("staffId");

-- AddForeignKey
ALTER TABLE "EquipmentReturnRequest" ADD CONSTRAINT "EquipmentReturnRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: mavjud IN_PROGRESS arizalar uchun "inProgressAt" taxminiy sifatida
-- "createdAt"ga tenglashtiriladi — yangi 2-kunlik SLA tekshiruvi darhol ishlashi uchun.
UPDATE "EquipmentReturnRequest" SET "inProgressAt" = "createdAt" WHERE "status" = 'IN_PROGRESS';

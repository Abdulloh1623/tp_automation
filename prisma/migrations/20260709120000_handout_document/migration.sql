-- AlterTable: hujjatli ustaga topshirish (handover document) maydonlari
ALTER TABLE "EquipmentMovement" ADD COLUMN     "documentStatus" TEXT,
ADD COLUMN     "signedDocUrl" TEXT;

-- CreateIndex
CREATE INDEX "EquipmentMovement_documentStatus_idx" ON "EquipmentMovement"("documentStatus");

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "assigneeType" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "assignedStaffId" TEXT;

-- Backfill: mavjud usta biriktiruvlarini yangi tur bilan belgilaymiz
UPDATE "Ticket" SET "assigneeType" = 'USTA' WHERE "assignedUstaId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Ticket_assignedStaffId_idx" ON "Ticket"("assignedStaffId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

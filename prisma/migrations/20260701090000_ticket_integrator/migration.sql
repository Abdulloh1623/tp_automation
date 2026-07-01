-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "assignedUstaId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_assignedUstaId_idx" ON "Ticket"("assignedUstaId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedUstaId_fkey" FOREIGN KEY ("assignedUstaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

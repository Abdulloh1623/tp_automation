-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "ustaBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ustaBlockedAt" TIMESTAMP(3),
ADD COLUMN     "ustaBlockedNote" TEXT;

-- AlterTable
ALTER TABLE "EquipmentReturnRequest" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedNote" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedNote" TEXT;

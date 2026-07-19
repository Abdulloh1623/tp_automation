-- AlterTable
ALTER TABLE "PendingPayment" ADD COLUMN     "amountCandidates" TEXT,
ADD COLUMN     "amountConfidence" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3),
ADD COLUMN     "ocrText" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'TELEGRAM',
ADD COLUMN     "suggestedAmount" DOUBLE PRECISION,
ADD COLUMN     "suggestedCurrency" TEXT;

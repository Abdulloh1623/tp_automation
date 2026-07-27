-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cardVerifier" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PendingCardPayment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "days" INTEGER NOT NULL DEFAULT 30,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiptNote" TEXT,
    "receiptPath" TEXT,
    "receiptMime" TEXT,
    "recordedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedVia" TEXT,
    "rejectReason" TEXT,
    "tgMessages" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCardPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingCardPayment_status_createdAt_idx" ON "PendingCardPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PendingCardPayment_clientId_idx" ON "PendingCardPayment"("clientId");

-- AddForeignKey
ALTER TABLE "PendingCardPayment" ADD CONSTRAINT "PendingCardPayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCardPayment" ADD CONSTRAINT "PendingCardPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCardPayment" ADD CONSTRAINT "PendingCardPayment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "PendingPayment" (
    "id" TEXT NOT NULL,
    "tgChatId" TEXT NOT NULL,
    "tgMessageId" TEXT NOT NULL,
    "senderName" TEXT,
    "rawText" TEXT,
    "parsedName" TEXT,
    "parsedPhone" TEXT,
    "sheetNo" TEXT,
    "suggestedClientId" TEXT,
    "receiptPath" TEXT,
    "receiptMime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingPayment_status_receivedAt_idx" ON "PendingPayment"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPayment_tgChatId_tgMessageId_key" ON "PendingPayment"("tgChatId", "tgMessageId");

-- AddForeignKey
ALTER TABLE "PendingPayment" ADD CONSTRAINT "PendingPayment_suggestedClientId_fkey" FOREIGN KEY ("suggestedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPayment" ADD CONSTRAINT "PendingPayment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

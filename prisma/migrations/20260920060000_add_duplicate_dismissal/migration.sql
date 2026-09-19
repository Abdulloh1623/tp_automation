-- CreateTable
CREATE TABLE "DuplicateDismissal" (
    "id" TEXT NOT NULL,
    "clientAId" TEXT NOT NULL,
    "clientBId" TEXT NOT NULL,
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateDismissal_clientAId_clientBId_key" ON "DuplicateDismissal"("clientAId", "clientBId");

-- CreateIndex
CREATE INDEX "DuplicateDismissal_clientBId_idx" ON "DuplicateDismissal"("clientBId");

-- AddForeignKey
ALTER TABLE "DuplicateDismissal" ADD CONSTRAINT "DuplicateDismissal_clientAId_fkey" FOREIGN KEY ("clientAId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateDismissal" ADD CONSTRAINT "DuplicateDismissal_clientBId_fkey" FOREIGN KEY ("clientBId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

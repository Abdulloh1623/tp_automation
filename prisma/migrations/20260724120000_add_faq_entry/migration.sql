-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "details" TEXT,
    "solution" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaqEntry_createdAt_idx" ON "FaqEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "FaqEntry" ADD CONSTRAINT "FaqEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

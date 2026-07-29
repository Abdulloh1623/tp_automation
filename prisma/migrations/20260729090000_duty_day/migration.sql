-- CreateTable
CREATE TABLE "DutyDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DutyDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DutyDay_date_idx" ON "DutyDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DutyDay_userId_date_key" ON "DutyDay"("userId", "date");

-- AddForeignKey
ALTER TABLE "DutyDay" ADD CONSTRAINT "DutyDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

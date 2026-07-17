-- CreateTable
CREATE TABLE "TaxConnection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "certificatePath" TEXT,
    "directorName" TEXT NOT NULL,
    "directorPhone" TEXT NOT NULL,
    "documentPath" TEXT,
    "geoLink" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "byUserId" TEXT,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxConnection_clientId_idx" ON "TaxConnection"("clientId");

-- CreateIndex
CREATE INDEX "TaxConnection_status_idx" ON "TaxConnection"("status");

-- AddForeignKey
ALTER TABLE "TaxConnection" ADD CONSTRAINT "TaxConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Mijoz takliflari (Suggestion) — muammo emas, dastur/jarayon yuzasidan taklif.
-- Additive (yangi jadval/indeks/FK) — image rollback xavfsiz. Idempotent.

-- CreateTable: Suggestion
CREATE TABLE IF NOT EXISTS "Suggestion" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Suggestion_status_createdAt_idx" ON "Suggestion"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Suggestion_clientId_idx" ON "Suggestion"("clientId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

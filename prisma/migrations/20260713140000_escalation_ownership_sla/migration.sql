-- Eskalatsiya mas'uli (TP xodim) + 3-kunlik SLA vaqtlari.
-- Barchasi additive (yangi ustunlar/indeks/FK) — image rollback xavfsiz.
-- Idempotent: IF NOT EXISTS + FK uchun DO-guard.

-- AlterTable: Client — eskalatsiya mas'uli va SLA belgilari
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "escalationStaffId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "slaNotifiedAt" TIMESTAMP(3);

-- AlterTable: Ticket — SLA ogohlantirish belgisi
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "slaNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Client_escalationStaffId_idx" ON "Client"("escalationStaffId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "Client" ADD CONSTRAINT "Client_escalationStaffId_fkey"
    FOREIGN KEY ("escalationStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

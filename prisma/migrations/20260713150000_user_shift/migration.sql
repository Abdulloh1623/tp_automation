-- Operator ish smenasi (DAY/NIGHT) — tablo endi ism-taxmini o'rniga shu
-- maydon bo'yicha filtrlaydi. Additive + idempotent.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "shift" TEXT NOT NULL DEFAULT 'DAY';

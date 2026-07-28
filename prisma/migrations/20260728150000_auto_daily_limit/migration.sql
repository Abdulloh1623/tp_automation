-- Kunlik lid kvotasini avtomatik qilish.
--
-- `dailyLimit` endi ixtiyoriy: NULL = dastur o'zi hisoblaydi (bugungi qayta
-- aloqa ro'yxati / faol operatorlar, `/sozlamalar` chegaralari ichida).
-- Son qoldirilsa — o'sha xodim uchun qat'iy chegara bo'lib qoladi.
--
-- Mavjud xodimlar AVTOMATIKKA o'tkaziladi: eski qiymatlar (asosan standart 20)
-- qo'lda o'ylab qo'yilgan reja emas, balki avvalgi standart edi. Alohida odamga
-- qat'iy son kerak bo'lsa, admin uni /foydalanuvchilar dan qayta kiritadi.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "dailyLimit" DROP NOT NULL,
                   ALTER COLUMN "dailyLimit" DROP DEFAULT;

UPDATE "User" SET "dailyLimit" = NULL;

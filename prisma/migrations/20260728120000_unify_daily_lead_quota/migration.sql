-- Kunlik lid kvotasini bitta maydonga birlashtirish.
--
-- Ilgari ikkita maydon bor edi va ular bir-biriga zid ishlardi:
--   dailyLeadTarget — web forma va bot MENYUSI shuni tahrirlardi (board maqsadi)
--   dailyLimit      — qo'lda biriktirish chegarasi; UI'dan tahrirlanmasdi
-- Avtomatik taqsimot esa ikkalasini ham e'tiborsiz qoldirib, global 50 berardi.
--
-- Amalda foydalanuvchilar `dailyLeadTarget` ni sozlab kelgan (faqat shuni
-- tahrirlash mumkin edi), shuning uchun qiymatlar o'shandan ko'chiriladi.
UPDATE "User" SET "dailyLimit" = "dailyLeadTarget";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "dailyLeadTarget";

-- Ma'lumot-migratsiyasi: rol tizimi kengaytirildi — eski "MANAGER"
-- ("Texnik bo'lim boshlig'i") roli "SUPER_ADMIN"ga o'zgartirildi (kengaytirilgan,
-- cheklovsiz rol; ADMIN qila oladigan hammasi + admin-darajadagi hisoblarni
-- boshqarish + backup tiklash). Yangi "HEAD_OF_SUPPORT" ("Texnik bo'lim
-- rahbari") roli esa qo'lda /foydalanuvchilar orqali biriktiriladi — bu yerda
-- avtomatik migratsiya qilinadigan eski qiymati yo'q.
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'MANAGER';

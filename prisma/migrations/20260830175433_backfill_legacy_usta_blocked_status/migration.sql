-- Ma'lumot-migratsiyasi: eskalatsiya kanban'i endi bosqichni (ustaStatus)
-- yo'qotmaydigan mustaqil `ustaBlocked` bayrog'idan foydalanadi. Eski
-- FAILED/REVISIT qiymatlari (hozir FAOL, stage=FORWARDED bo'lgan
-- eskalatsiyalarda) yangi modelga ko'chiriladi — aks holda bu yozuvlar
-- hech qaysi kanban ustuniga to'g'ri kelmay, ko'rinmay qolardi.
-- Bosqich ARRIVED deb qaytariladi (FAILED/REVISIT odatda Bordimdan keyin
-- qo'yilgan) — usta "Qayta urinish" bosganda to'g'ri ustunga qaytishi uchun.
UPDATE "Client"
SET "ustaBlocked" = true,
    "ustaBlockedAt" = now(),
    "ustaBlockedNote" = CASE
      WHEN "ustaStatus" = 'FAILED' THEN 'Eski holatdan ko''chirildi: Hal bo''lmadi'
      ELSE 'Eski holatdan ko''chirildi: Qayta kerak'
    END,
    "ustaStatus" = 'ARRIVED'
WHERE "stage" = 'FORWARDED' AND "ustaStatus" IN ('FAILED', 'REVISIT');

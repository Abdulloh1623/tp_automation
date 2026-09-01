-- Mavjud (qattiq kodlangan) ORTADAGI bosqichlarni PipelineStage'ga bir
-- martalik seed qiladi — DB migratsiya bilan avtomatik boradi, shu bois
-- HAR bir muhitda (dev/CI/prod) kafolatlangan holda mavjud bo'ladi
-- (`scripts/seed-pipeline-stages.ts` qo'lda ishga tushirishga bog'liq edi —
-- Muammolar/Yangi versiya pipeline'lari endi kod ichida shu bosqichga
-- tayanadi, shu sabab bo'sh zanjir bilan ishlay olmaydi).
-- Ticket.status/EquipmentReturnRequest.status'dagi haqiqiy DB qiymatlariga
-- TEGMAYDI (kalitlar bir xil qoladi, faqat nomi shu jadvaldan o'qiladi).
INSERT INTO "PipelineStage" (id, pipeline, key, label, "order", "createdAt")
VALUES
  ('seed-muammolar-inprogress', 'MUAMMOLAR', 'IN_PROGRESS', 'Jarayonda', 0, now()),
  ('seed-versiya-inprogress', 'VERSIYA', 'IN_PROGRESS', 'Jarayonda', 0, now()),
  ('seed-eskalatsiya-enroute', 'ESKALATSIYA', 'EN_ROUTE', 'Yo''ldaman', 0, now()),
  ('seed-eskalatsiya-arrived', 'ESKALATSIYA', 'ARRIVED', 'Bordim', 1, now()),
  ('seed-qaytarish-inprogress', 'QAYTARISH', 'IN_PROGRESS', 'Jarayonda', 0, now())
ON CONFLICT (pipeline, key) DO NOTHING;

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integratsion testlar ALOHIDA konfiguratsiyada (vitest.integration.config.ts)
    // — ular haqiqiy baza talab qiladi. `npm test` bazasiz va tez qolishi kerak.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
    // XAVFSIZLIK: lokal `.env` (dev/prod-ga o'xshash haqiqiy Telegram token +
    // kanal ID'lari) test jarayoniga o'tib ketmasin — aks holda test
    // ma'lumotlari (tasodifiy nom/sana) HAQIQIY kanalga ketadi. Har bir test
    // faylini alohida mock qilishga tayanmaslik uchun bu yerda global
    // o'chiriladi — `telegram.ts` token yo'qligida o'zi "disabled" rejimga
    // o'tadi (hech qanday fetch chaqirilmaydi).
    env: {
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_CHANNEL_ID: "",
      TELEGRAM_PAYMENTS_CHANNEL_ID: "",
      TELEGRAM_RECEIPTS_GROUP_ID: "",
      TELEGRAM_BACKUP_CHANNEL_ID: "",
      TELEGRAM_ERRORS_CHANNEL_ID: "",
      TELEGRAM_ERRORS_CRITICAL_CHANNEL_ID: "",
    },
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
});

// Strukturalangan (JSON) log — pino. FAQAT Node runtime uchun (Edge/middleware
// import QILMASIN). Prod'da stdout'ga bitta qatorli JSON yozadi (agregatsiya
// uchun tayyor); transport ISHLATILMAYDI — worker-thread nosozliklari bo'lmaydi
// va bot worker + skriptlarda ham bir xil ishlaydi.
//
// Dev'da ham JSON chiqadi; o'qishga qulay ko'rinish uchun:  npm run dev | npx pino-pretty
import pino from "pino";

const level =
  process.env.LOG_LEVEL?.trim() ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

export const logger = pino({
  level,
  base: { app: "tp-automation" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // `level` maydonini raqam emas, matn ("info") sifatida yozadi — qidirish oson.
  formatters: { level: (label) => ({ level: label }) },
  // Maxfiy maydonlarni loglardan yashiramiz (xato ob'ekti/kontekst ichida kelsa).
  redact: {
    paths: ["password", "token", "*.password", "*.token", "req.headers.cookie", "req.headers.authorization"],
    censor: "[redacted]",
  },
});

/** Kontekst (masalan requestId, source) bilan bog'langan bola-logger. */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

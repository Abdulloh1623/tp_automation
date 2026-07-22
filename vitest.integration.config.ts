import { defineConfig } from "vitest/config";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

// Lokal ishlab chiqishda `.env.test` dan o'qiymiz (u gitignore'da — ichida
// lokal baza paroli bor). CI'da bunday fayl yo'q, u yerda o'zgaruvchilar
// to'g'ridan-to'g'ri muhitdan keladi.
const envFile = path.resolve(process.cwd(), ".env.test");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

/**
 * Integratsion testlar — HAQIQIY PostgreSQL bazasiga qarshi ishlaydi.
 *
 * Nega alohida konfiguratsiya: `npm test` (unit) tez bo'lib qolishi kerak —
 * u sekundlar ichida ishlaydi va har saqlashda chaqiriladi. Integratsion
 * testlar esa baza ko'tarilishini talab qiladi va sekinroq.
 *
 * Ishga tushirish: `npm run test:integration`.
 * Lokalda `.env.test` (namunasi: `.env.test.example`) kerak; CI'da muhit
 * o'zgaruvchilari to'g'ridan-to'g'ri beriladi.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Testlardan oldin bir marta: test bazasiga migratsiyalarni qo'llaydi
    // (sxema o'zgargach tp_test avtomatik yangilanadi — lokal DX).
    globalSetup: ["src/test/integration-global-setup.ts"],
    setupFiles: ["src/test/integration-setup.ts"],
    // Bir baza — testlar KETMA-KET ishlashi shart (bir-birining ma'lumotini
    // o'chirib yubormasligi uchun).
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
});

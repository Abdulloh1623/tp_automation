import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integratsion testlar ALOHIDA konfiguratsiyada (vitest.integration.config.ts)
    // — ular haqiqiy baza talab qiladi. `npm test` bazasiz va tez qolishi kerak.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
});

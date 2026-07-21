import { test, expect } from "@playwright/test";

// Seed (prisma/seed.ts) yaratadigan admin — parol: parol123
const ADMIN = { username: "admin", password: "parol123" };

/**
 * To'lovlar sahifasi server komponent, metrik kartalar esa client. Ular orasida
 * faqat seriyalanadigan qiymat o'tishi kerak — bir marta lucide ikon
 * komponenti prop qilib uzatilgani prodda sahifani butunlay yiqitgan
 * ("Functions cannot be passed directly to Client Components"). Bu test shu
 * regressiyani ushlaydi: sahifa render bo'ladimi va karta ochiladimi.
 */
test.describe("To'lovlar sahifasi", () => {
  test("sahifa ochiladi va metrik karta batafsil ro'yxatni ko'rsatadi", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", ADMIN.username);
    await page.fill("#password", ADMIN.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    await page.goto("/tolovlar");
    await expect(page.getByRole("heading", { name: "To'lovlar" })).toBeVisible();

    // Karta ustiga bosilganda modal ochiladi (mijoz/summa/sana ustunlari bilan)
    // aria-haspopup — jadval ustidagi bir xil nomli filtr chipidan ajratish uchun
    const card = page
      .locator('[role="button"][aria-haspopup="dialog"]')
      .filter({ hasText: "Muddati o'tgan" });
    await card.click();
    const dialog = page.getByRole("dialog", { name: /Muddati o'tgan/ });
    await expect(dialog).toBeVisible();
    // Mijoz / summa / sana ustunlari — talab qilingan ma'lumot
    await expect(dialog.getByText("Mijoz", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Oylik", { exact: true })).toBeVisible();
    await expect(dialog.getByText("To'lov sanasi", { exact: true })).toBeVisible();

    // Escape bilan yopiladi
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

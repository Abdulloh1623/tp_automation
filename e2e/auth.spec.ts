import { test, expect, type Page } from "@playwright/test";

// Seed (prisma/seed.ts) yaratadigan test akkauntlari — barcha parol: parol123
const ADMIN = { username: "admin", password: "parol123" };
const OPERATOR = { username: "asadbek", password: "parol123" };

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto("/login");
  await page.fill("#username", creds.username);
  await page.fill("#password", creds.password);
  await page.click('button[type="submit"]');
}

test.describe("Autentifikatsiya va RBAC", () => {
  test("avtorizatsiyasiz himoyalangan sahifa → /login ga yo'naltiradi", async ({ page }) => {
    await page.goto("/mijozlar");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("#username")).toBeVisible();
  });

  test("noto'g'ri parol → xato ko'rsatiladi, login sahifasida qoladi", async ({ page }) => {
    await login(page, { username: "admin", password: "notogri-parol" });
    await expect(page.getByText("Login yoki parol noto'g'ri")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin login → boshqaruv paneli (/)", async ({ page }) => {
    await login(page, ADMIN);
    await expect(page).toHaveURL("/");
    // Login formasidan chiqib ketdi (himoyalangan ilovaga kirdi)
    await expect(page.locator("#password")).toHaveCount(0);
  });

  test("operator login → /lidlar (roleHome)", async ({ page }) => {
    await login(page, OPERATOR);
    await expect(page).toHaveURL("/lidlar");
  });

  test("operator admin-only sahifaga kira olmaydi → roleHome ga qaytariladi", async ({ page }) => {
    await login(page, OPERATOR);
    await expect(page).toHaveURL("/lidlar");
    // /foydalanuvchilar faqat ADMIN — middleware operatorni roleHome (/lidlar) ga qaytaradi
    await page.goto("/foydalanuvchilar");
    await expect(page).toHaveURL("/lidlar");
  });

  test("operator boshqaruv panelini (/) ko'ra olmaydi → /lidlar", async ({ page }) => {
    await login(page, OPERATOR);
    await expect(page).toHaveURL("/lidlar"); // login redirect tugashini (cookie) kutamiz
    await page.goto("/");
    await expect(page).toHaveURL("/lidlar");
  });
});

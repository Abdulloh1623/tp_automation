import { test, expect, type Page } from "@playwright/test";

/**
 * Asosiy ekranlarning skrinshotlari — CI artefakti sifatida saqlanadi
 * (`playwright-screenshots`). Maqsad: har PR'da UI o'zgarishini ko'z bilan
 * solishtirish va "ui-audit" tekshiruvini skrinshot bilan bajarish.
 *
 * Bu testlar HECH NARSANI tasdiqlamaydi (assert yo'q) — ular faqat rasm oladi,
 * shuning uchun UI o'zgarishi CI'ni qizartirmaydi. Sahifa umuman ochilmasa
 * (masalan 500 xato) test yiqiladi — bu esa haqiqiy signal.
 */

const ADMIN = { username: "admin", password: "parol123" };

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#username", ADMIN.username);
  await page.fill("#password", ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

const PAGES: { path: string; name: string }[] = [
  { path: "/", name: "panel" },
  { path: "/mijozlar", name: "mijozlar" },
  { path: "/lidlar", name: "lidlar" },
  { path: "/tolovlar", name: "tolovlar" },
  { path: "/ombor", name: "ombor" },
  { path: "/muammolar", name: "muammolar" },
  { path: "/hisobot", name: "hisobot" },
];

for (const vp of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobil", width: 390, height: 844 },
]) {
  test.describe(`Skrinshotlar — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`asosiy sahifalar (${vp.name})`, async ({ page }) => {
      await login(page);
      for (const p of PAGES) {
        await page.goto(p.path);
        // Sahifa qotib qolmaganini tekshiramiz (skelet emas, haqiqiy kontent)
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: `screenshots/${vp.name}-${p.name}.png`,
          fullPage: true,
        });
      }
    });

    test(`mijoz profili modali (${vp.name})`, async ({ page }) => {
      await login(page);
      await page.goto("/mijozlar");
      await page.waitForLoadState("networkidle");

      // Ro'yxatdagi birinchi mijoz nomi — profil modalini ochadi.
      // DIQQAT: `a[href^="/mijozlar/"]` ishlatmang — u "Yangi mijoz"
      // (/mijozlar/yangi) tugmasiga ham tushadi va modal ochilmaydi.
      // `:visible` SHART — jadval (desktop) va kartalar (mobil) ikkalasi ham
      // DOM'da bo'ladi, faqat CSS bilan yashiriladi. `:visible`siz mobil
      // o'lchamda ko'rinmas jadval havolasi tanlanib, bosish kutib qolardi.
      const firstClient = page.locator('[data-testid="client-link"]:visible').first();
      if ((await firstClient.count()) === 0) test.skip(true, "Mijoz yo'q (seed bo'sh)");
      await firstClient.click();

      // Modal ochilishini kutamiz (skelet ham, to'liq profil ham dialog)
      await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await page.screenshot({
        path: `screenshots/${vp.name}-mijoz-profili.png`,
        fullPage: true,
      });

      // Yopish tugmasi kontent uzun bo'lsa ham ko'rinishi kerak (PR #161)
      await page.mouse.wheel(0, 2000);
      await page.screenshot({
        path: `screenshots/${vp.name}-mijoz-profili-pastda.png`,
        fullPage: false,
      });
    });
  });
}

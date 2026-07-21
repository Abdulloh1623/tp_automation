import { test, expect, type Page } from "@playwright/test";

// CSP nonce regressiya testi.
//
// Ilgari `script-src` da 'unsafe-inline' turardi — ya'ni CSP XSS ni to'smasdi.
// Bu testlar shu holatga qaytib qolishning oldini oladi.
//
// MUHIM: dev serverda CSP ataylab bo'shroq (Next HMR 'unsafe-eval' va inline
// talab qiladi). Qattiq tekshiruvlar shu bois faqat PRODUCTION build'da
// bajariladi — CI aynan shunday ishlatadi (playwright.config.ts: `npm run start`).
// Lokal `npm run dev` da ular o'tkazib yuboriladi, sababi aniq yozib qoldiriladi.

async function getCsp(page: Page): Promise<string> {
  const res = await page.goto("/login");
  const csp = res?.headers()["content-security-policy"];
  expect(csp, "CSP sarlavhasi har javobda bo'lishi kerak").toBeTruthy();
  return csp!;
}

/** Dev CSP'da 'unsafe-eval' bo'ladi — shu bo'yicha rejimni aniqlaymiz. */
const isDevCsp = (csp: string) => csp.includes("'unsafe-eval'");

test.describe("Content-Security-Policy", () => {
  test("script-src nonce va strict-dynamic ishlatadi", async ({ page }) => {
    const csp = await getCsp(page);
    const scriptSrc = csp
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("script-src"));

    expect(scriptSrc, "script-src direktivasi bo'lishi kerak").toBeTruthy();
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).toContain("'strict-dynamic'");

    // Boshqa muhim direktivalar — rejimdan qat'i nazar.
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("PROD: script-src da 'unsafe-inline' / 'unsafe-eval' YO'Q", async ({ page }) => {
    const csp = await getCsp(page);
    test.skip(isDevCsp(csp), "dev serverda HMR uchun bo'shroq CSP — CI prod build'da tekshiradi");

    const scriptSrc = csp
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  test("nonce har so'rovda o'zgaradi", async ({ page }) => {
    const nonces: string[] = [];
    for (let i = 0; i < 3; i++) {
      const csp = await getCsp(page);
      nonces.push(/'nonce-([^']+)'/.exec(csp)?.[1] ?? "");
    }
    expect(nonces.every(Boolean), "har javobda nonce bo'lishi kerak").toBe(true);
    expect(new Set(nonces).size, "nonce takrorlanmasligi kerak").toBe(3);
  });

  test("PROD: dastlabki HTML dagi barcha <script> teglari nonce bilan", async ({ page }) => {
    const csp = await getCsp(page);
    test.skip(isDevCsp(csp), "dev build'da Next qo'shimcha skriptlar qo'shadi");

    // DOM emas, AYNAN server qaytargan HTML tekshiriladi: strict-dynamic tufayli
    // ishonilgan skript keyinchalik nonce'siz skript yuklashi mumkin va bu normal.
    const html = await (await page.request.get("/login")).text();
    const tags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length, "sahifada skript bo'lishi kerak").toBeGreaterThan(0);
    const withoutNonce = tags.filter((t) => !t.includes("nonce="));
    expect(withoutNonce, `nonce'siz skript: ${withoutNonce.join(" ")}`).toHaveLength(0);
  });

  test("CSP buzilishi yo'q va sahifa interaktiv", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to (execute|load)/i.test(t)) violations.push(t);
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(violations, `CSP buzilishi: ${violations.join(" | ")}`).toHaveLength(0);

    // Skriptlar bloklanmaganini bilvosita tasdiqlaydi — bloklansa React
    // gidratsiya qilmaydi va forma boshqarilmaydi.
    await page.fill("#username", "test");
    await expect(page.locator("#username")).toHaveValue("test");
  });
});

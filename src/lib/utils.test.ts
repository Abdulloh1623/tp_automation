import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  formatPhone,
  formatMoney,
  daysUntil,
  formatAmountInput,
  parseAmountInput,
  formatPhoneInput,
} from "./utils";

describe("normalizePhone", () => {
  it("faqat raqamlarni qoldiradi", () => {
    expect(normalizePhone("+998 90 481 43 75")).toBe("998904814375");
    expect(normalizePhone("(99) 344-98-01")).toBe("993449801");
  });
  it("bo'sh/null → bo'sh satr", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("")).toBe("");
  });
});

describe("formatPhone", () => {
  it("12 raqamli (998...) ni formatlaydi", () => {
    expect(formatPhone("998904814375")).toBe("+998 90 481 43 75");
  });
  it("9 raqamli mobil ni formatlaydi", () => {
    expect(formatPhone("904814375")).toBe("+998 90 481 43 75");
  });
  it("null → tire", () => {
    expect(formatPhone(null)).toBe("—");
  });
});

describe("formatMoney", () => {
  it("USD oldiga $ qo'yadi", () => {
    expect(formatMoney(50, "USD")).toBe("$50");
    expect(formatMoney(500, "USD")).toBe("$500");
  });
  it("UZS yoniga so'm qo'yadi va butunga yaxlitlaydi", () => {
    expect(formatMoney(500, "UZS")).toBe("500 so'm");
    expect(formatMoney(29.6, "UZS")).toBe("30 so'm");
  });

  // Ming ajratgichi Intl'dan OLINMAYDI: Node "1 946", Chrome esa "1,946"
  // berardi va summa ko'rsatadigan klient komponentlarda hydration mismatch
  // bo'lardi. Shu bois ajratgich aynan uzilmas probel ekani tekshiriladi.
  it("mingni uzilmas probel bilan ajratadi (muhitga bog'liq emas)", () => {
    expect(formatMoney(1946, "USD")).toBe("$1 946");
    expect(formatMoney(1234567, "UZS")).toBe("1 234 567 so'm");
    expect(formatMoney(999, "USD")).toBe("$999");
  });
  it("kasr qismi vergul bilan, ortiqcha nollarsiz", () => {
    expect(formatMoney(10495.5, "USD")).toBe("$10 495,5");
    expect(formatMoney(102.25, "USD")).toBe("$102,25");
    expect(formatMoney(29.004, "USD")).toBe("$29");
  });
});

describe("formatAmountInput", () => {
  it("mingliklarni probel bilan ajratadi", () => {
    expect(formatAmountInput("9000000")).toBe("9 000 000");
    expect(formatAmountInput("1500")).toBe("1 500");
    expect(formatAmountInput("500")).toBe("500");
  });
  it("allaqachon formatlangan qiymatni buzmaydi (idempotent)", () => {
    expect(formatAmountInput("9 000 000")).toBe("9 000 000");
  });
  it("kasr qismini 2 xonagacha saqlaydi", () => {
    expect(formatAmountInput("1234.5")).toBe("1 234.5");
    expect(formatAmountInput("1000.567")).toBe("1 000.56");
  });
  it("boshdagi nollarni tozalaydi, bo'sh → bo'sh", () => {
    expect(formatAmountInput("007")).toBe("7");
    expect(formatAmountInput("")).toBe("");
    expect(formatAmountInput("0")).toBe("0");
  });
});

describe("parseAmountInput", () => {
  it("probel/harflarni olib xom raqam qaytaradi", () => {
    expect(parseAmountInput("9 000 000")).toBe("9000000");
    expect(parseAmountInput("1 234.50 so'm")).toBe("1234.50");
  });
  it("faqat bitta nuqta va 2 xona kasr", () => {
    expect(parseAmountInput("1.2.3")).toBe("1.23");
  });
});

describe("formatPhoneInput", () => {
  it("998 bilan boshlansa guruhlaydi", () => {
    expect(formatPhoneInput("998904814375")).toBe("+998 90 481 43 75");
    expect(formatPhoneInput("+998 90 481 43 75")).toBe("+998 90 481 43 75");
  });
  it("yozilayotgan qismni progressiv formatlaydi", () => {
    expect(formatPhoneInput("+998")).toBe("+998");
    expect(formatPhoneInput("+99890")).toBe("+998 90");
    expect(formatPhoneInput("+998 90 4")).toBe("+998 90 4");
  });
  it("998 bo'lmasa foydalanuvchi kiritganini (+ bilan) saqlaydi", () => {
    expect(formatPhoneInput("+7999")).toBe("+7999");
    expect(formatPhoneInput("")).toBe("");
  });
});

describe("daysUntil", () => {
  it("null → null", () => {
    expect(daysUntil(null)).toBeNull();
  });
  it("kelajak musbat, o'tgan manfiy, bugun 0", () => {
    const mk = (n: number) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + n);
      return d;
    };
    expect(daysUntil(mk(0))).toBe(0);
    expect(daysUntil(mk(3))).toBe(3);
    expect(daysUntil(mk(-2))).toBe(-2);
  });
});

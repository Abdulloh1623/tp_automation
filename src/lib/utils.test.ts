import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhone, formatMoney, daysUntil } from "./utils";

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

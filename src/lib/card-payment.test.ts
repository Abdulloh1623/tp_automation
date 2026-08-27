import { describe, it, expect } from "vitest";
import {
  needsCardConfirmation,
  cardRequestCaption,
  approveButtons,
  rejectReasonButtons,
} from "./card-payment";
import { CARD_REJECT_REASON } from "./constants";

describe("needsCardConfirmation", () => {
  it("karta va QR — tasdiq kerak", () => {
    expect(needsCardConfirmation("CARD")).toBe(true);
    expect(needsCardConfirmation("QR")).toBe(true);
  });

  it("boshqa/bo'sh usul — tasdiq kerak emas", () => {
    expect(needsCardConfirmation("CASH")).toBe(false);
    expect(needsCardConfirmation(null)).toBe(false);
    expect(needsCardConfirmation(undefined)).toBe(false);
    expect(needsCardConfirmation("")).toBe(false);
  });
});

describe("cardRequestCaption", () => {
  const base = {
    restaurantName: "Osh Markazi",
    fullName: "Ali Valiyev",
    phone: "+998901234567",
    amount: 120,
    currency: "USD",
    method: "CARD",
    paidAt: new Date("2026-07-27T09:32:00.000Z"),
    operatorName: "Dilnoza",
  };

  it("summa, mijoz va operator ko'rinadi", () => {
    const c = cardRequestCaption(base);
    expect(c).toContain("Osh Markazi");
    expect(c).toContain("Ali Valiyev");
    expect(c).toContain("Dilnoza");
    expect(c).toContain("120");
    expect(c).toContain("Karta orqali");
  });

  it("HTML belgilari ekranlanadi (xabar buzilmasin)", () => {
    const c = cardRequestCaption({ ...base, restaurantName: "Osh <b>&</b> Kabob" });
    expect(c).toContain("&lt;b&gt;");
    expect(c).not.toContain("<b>Osh");
  });

  it("izoh bo'lmasa qator qo'shilmaydi", () => {
    expect(cardRequestCaption(base)).not.toContain("📝");
    expect(cardRequestCaption({ ...base, note: "oldindan" })).toContain("📝 oldindan");
  });

  it("vaqt UTC+5 (Toshkent) bo'yicha, Intl'siz hisoblanadi", () => {
    // 09:32 UTC -> 14:32 Toshkent. Node'ning standart (small-icu) qurilishida
    // `toLocaleTimeString("uz-UZ", ...)` bunga bog'liq bo'lganda ish muhitiga
    // qarab jim tarzda boshqa natija berishi mumkin edi (ICU ma'lumoti yo'q).
    expect(cardRequestCaption(base)).toContain("14:32");
  });
});

describe("tugmalar", () => {
  it("tasdiqlash/rad etish callback ma'lumoti so'rov id sini saqlaydi", () => {
    const [row] = approveButtons("abc123");
    expect(row[0].callback_data).toBe("cardpay:ok:abc123");
    expect(row[1].callback_data).toBe("cardpay:no:abc123");
  });

  it("rad etish sabablari — har biriga tugma + orqaga", () => {
    const rows = rejectReasonButtons("abc123");
    expect(rows).toHaveLength(Object.keys(CARD_REJECT_REASON).length + 1);
    expect(rows[0][0].callback_data).toBe("cardpay:no:abc123:NO_MONEY");
    expect(rows.at(-1)![0].callback_data).toBe("cardpay:back:abc123");
  });

  it("bot regex callback ma'lumotini to'g'ri ajratadi", () => {
    // lib/bot.ts dagi bilan bir xil naqsh
    const re = /^cardpay:(ok|no|back):([^:]+)(?::([A-Z_]+))?$/;
    expect(re.exec("cardpay:ok:abc123")?.slice(1)).toEqual(["ok", "abc123", undefined]);
    expect(re.exec("cardpay:no:abc123:WRONG_AMOUNT")?.slice(1)).toEqual([
      "no",
      "abc123",
      "WRONG_AMOUNT",
    ]);
    expect(re.exec("cardpay:xx:abc123")).toBeNull();
  });
});

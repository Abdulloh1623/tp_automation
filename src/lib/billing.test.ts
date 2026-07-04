import { describe, it, expect } from "vitest";
import { computeNextPaymentDate } from "./billing";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("computeNextPaymentDate", () => {
  const from = new Date(2026, 6, 4); // 2026-07-04 (lokal)

  it("kelasi kun shu oyda bo'lsa — shu oyni qaytaradi", () => {
    // shartnoma 14-aprel → 14-iyul (bugundan keyin)
    expect(ymd(computeNextPaymentDate(new Date(2026, 3, 14), from))).toBe("2026-07-14");
  });

  it("kun allaqachon o'tgan bo'lsa — keyingi oyga o'tadi", () => {
    // 2-may → 2-iyul o'tib ketgan → 2-avgust
    expect(ymd(computeNextPaymentDate(new Date(2026, 4, 2), from))).toBe("2026-08-02");
  });

  it("bugungi kunga teng bo'lsa — bugunni qaytaradi (o'tgan emas)", () => {
    // 4-kun == 4-iyul
    expect(ymd(computeNextPaymentDate(new Date(2026, 0, 4), from))).toBe("2026-07-04");
  });

  it("31-kun 30 kunlik oyda oxirgi kunga qisqaradi", () => {
    // 31-kun, from = 5-noyabr (noyabr 30 kun) → 30-noyabr
    const nov = new Date(2026, 10, 5);
    expect(ymd(computeNextPaymentDate(new Date(2026, 0, 31), nov))).toBe("2026-11-30");
  });

  it("31-kun fevralda oxirgi kunga qisqaradi", () => {
    // 31-kun, from = 1-fevral 2026 (28 kun) → 28-fevral
    const feb = new Date(2026, 1, 1);
    expect(ymd(computeNextPaymentDate(new Date(2026, 0, 31), feb))).toBe("2026-02-28");
  });
});

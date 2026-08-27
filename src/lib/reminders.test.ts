import { describe, it, expect } from "vitest";
import { dayMonthLabel } from "./reminders";

describe("dayMonthLabel", () => {
  it("UTC+5 (Toshkent) bo'yicha, o'zbekcha oy nomi bilan — Intl'siz", () => {
    // 27-avgust kuni UTC 20:00 -> UTC+5 da 28-avgustga o'tadi (kun chegarasi).
    expect(dayMonthLabel(new Date("2026-08-27T09:00:00.000Z"))).toBe("27 avgust");
    expect(dayMonthLabel(new Date("2026-08-27T20:00:00.000Z"))).toBe("28 avgust");
  });

  it("kun ikki xonali (0 bilan to'ldirilgan)", () => {
    expect(dayMonthLabel(new Date("2026-01-04T06:00:00.000Z"))).toBe("04 yanvar");
  });

  it("yil chegarasida ham to'g'ri", () => {
    expect(dayMonthLabel(new Date("2026-12-31T20:00:00.000Z"))).toBe("01 yanvar");
  });
});

import { describe, it, expect } from "vitest";
import { tzDayKey, tzDayStartFromInput } from "./tz";

describe("tzDayKey — Toshkent (UTC+5) taqvim kuni", () => {
  it("UTC kun chegarasidan keyin ham Toshkent kuniga to'g'ri o'tadi", () => {
    // 2026-07-22T23:30:00Z = 2026-07-23 04:30 (Toshkent) → 23-iyul
    const d = new Date("2026-07-22T23:30:00Z");
    expect(tzDayKey(d)).toBe("2026-07-23");
    // Solishtirish: UTC sanasi noto'g'ri kun berardi
    expect(d.toISOString().slice(0, 10)).toBe("2026-07-22");
  });

  it("Toshkent yarim tunidan sal oldin — oldingi kun", () => {
    // 2026-07-22T18:30:00Z = 2026-07-22 23:30 (Toshkent) → 22-iyul
    expect(tzDayKey(new Date("2026-07-22T18:30:00Z"))).toBe("2026-07-22");
  });

  it("Toshkent yarim tunidan sal keyin — yangi kun", () => {
    // 2026-07-22T19:30:00Z = 2026-07-23 00:30 (Toshkent) → 23-iyul
    expect(tzDayKey(new Date("2026-07-22T19:30:00Z"))).toBe("2026-07-23");
  });

  it("kun/oy ikki raqamli (padding) bo'ladi", () => {
    expect(tzDayKey(new Date("2026-01-05T06:00:00Z"))).toBe("2026-01-05");
  });
});

describe("tzDayStartFromInput — <input type=date> ni UTC+5 kun boshiga aylantirish", () => {
  it("Toshkent kun boshi UTC kun boshidan 5 soat keyin", () => {
    // 2026-07-23 (Toshkent) kun boshi = 2026-07-22T19:00:00Z
    expect(tzDayStartFromInput("2026-07-23")?.toISOString()).toBe("2026-07-22T19:00:00.000Z");
  });

  it("natija tzDayKey bilan izchil — o'sha kunga tegishli har qanday vaqt shu kalitni beradi", () => {
    const start = tzDayStartFromInput("2026-07-23")!;
    expect(tzDayKey(start)).toBe("2026-07-23");
    expect(tzDayKey(new Date(start.getTime() + 23 * 3600000))).toBe("2026-07-23");
  });

  it("bo'sh yoki yaroqsiz qiymat — null", () => {
    expect(tzDayStartFromInput("")).toBeNull();
    expect(tzDayStartFromInput(undefined)).toBeNull();
    expect(tzDayStartFromInput("not-a-date")).toBeNull();
  });
});

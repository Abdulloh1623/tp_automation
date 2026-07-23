import { describe, it, expect } from "vitest";
import { tzDayKey } from "./tz";

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

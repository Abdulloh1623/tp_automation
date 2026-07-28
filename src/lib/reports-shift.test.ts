import { describe, it, expect, vi } from "vitest";

// reports.ts og'ir bog'liqliklarni (prisma, resvg) tortadi — sof oyna mantig'ini
// tekshirish uchun ularni mock qilamiz.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("./db", () => ({ db: {} }));
vi.mock("./render-image", () => ({ svgToPng: () => Buffer.from("") }));

import { shiftWindow, isShiftKind } from "./reports";
import { tzTimeLabel, tzDayKey } from "./tz";

/** UTC+5 bo'yicha berilgan sana-vaqtdagi Date. */
const at = (day: string, hh: number, mm: number) =>
  new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000+05:00`);

describe("isShiftKind", () => {
  it("faqat smena turlarini tan oladi", () => {
    expect(isShiftKind("shift-day")).toBe(true);
    expect(isShiftKind("shift-night")).toBe(true);
    expect(isShiftKind("weekly")).toBe(false);
    expect(isShiftKind("monthly")).toBe(false);
  });
});

describe("shiftWindow — kunduzgi (17:30 da yuboriladi)", () => {
  it("cron vaqtida: bugun 09:30 dan 17:30 gacha", () => {
    const w = shiftWindow("shift-day", at("2026-07-28", 17, 30));
    expect(w.shift).toBe("DAY");
    expect(tzDayKey(w.start)).toBe("2026-07-28");
    expect(tzTimeLabel(w.start)).toBe("09:30");
    expect(tzTimeLabel(w.end)).toBe("17:30");
  });

  it("smena o'rtasida qo'lda so'ralsa — hozirgacha", () => {
    const now = at("2026-07-28", 13, 15);
    const w = shiftWindow("shift-day", now);
    expect(tzTimeLabel(w.start)).toBe("09:30");
    expect(w.end.getTime()).toBe(now.getTime());
  });

  it("kechqurun so'ralsa — tugagan smenani ko'rsatadi (17:30 da to'xtaydi)", () => {
    const w = shiftWindow("shift-day", at("2026-07-28", 21, 0));
    expect(tzDayKey(w.start)).toBe("2026-07-28");
    expect(tzTimeLabel(w.end)).toBe("17:30");
  });

  it("ertalab erta so'ralsa — kechagi tugagan kunduzgi smena", () => {
    const w = shiftWindow("shift-day", at("2026-07-28", 8, 0));
    expect(tzDayKey(w.start)).toBe("2026-07-27");
    expect(tzTimeLabel(w.start)).toBe("09:30");
    expect(tzDayKey(w.end)).toBe("2026-07-27");
    expect(tzTimeLabel(w.end)).toBe("17:30");
  });
});

describe("shiftWindow — kechki (09:30 da yuboriladi)", () => {
  it("cron vaqtida: kecha 17:30 dan bugun 09:30 gacha", () => {
    const w = shiftWindow("shift-night", at("2026-07-28", 9, 30));
    expect(w.shift).toBe("NIGHT");
    expect(tzDayKey(w.start)).toBe("2026-07-27");
    expect(tzTimeLabel(w.start)).toBe("17:30");
    expect(tzDayKey(w.end)).toBe("2026-07-28");
    expect(tzTimeLabel(w.end)).toBe("09:30");
  });

  it("tun o'rtasida so'ralsa — hozirgacha (tugallanmagan smena)", () => {
    const now = at("2026-07-28", 2, 0);
    const w = shiftWindow("shift-night", now);
    expect(tzDayKey(w.start)).toBe("2026-07-27");
    expect(w.end.getTime()).toBe(now.getTime());
  });

  it("kunduzi so'ralsa — tugagan tungi smena (09:30 da to'xtaydi)", () => {
    const w = shiftWindow("shift-night", at("2026-07-28", 14, 0));
    expect(tzDayKey(w.start)).toBe("2026-07-27");
    expect(tzTimeLabel(w.end)).toBe("09:30");
  });
});

describe("ikki oyna sutkani uzluksiz qoplaydi", () => {
  it("kechki smena tugashi = kunduzgi smena boshlanishi", () => {
    const night = shiftWindow("shift-night", at("2026-07-28", 9, 30));
    const day = shiftWindow("shift-day", at("2026-07-28", 17, 30));
    expect(night.end.getTime()).toBe(day.start.getTime());
  });

  it("kunduzgi smena tugashi = keyingi kechki smena boshlanishi", () => {
    const day = shiftWindow("shift-day", at("2026-07-28", 17, 30));
    const night = shiftWindow("shift-night", at("2026-07-29", 9, 30));
    expect(day.end.getTime()).toBe(night.start.getTime());
  });

  it("jami 24 soat — bo'shliq ham, ustma-ust tushish ham yo'q", () => {
    const night = shiftWindow("shift-night", at("2026-07-28", 9, 30));
    const day = shiftWindow("shift-day", at("2026-07-28", 17, 30));
    const total = night.end.getTime() - night.start.getTime() + (day.end.getTime() - day.start.getTime());
    expect(total).toBe(24 * 3600_000);
  });
});

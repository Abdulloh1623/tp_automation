import { describe, it, expect } from "vitest";
import { currentShift, shiftRange } from "./shift";
import { tzTimeLabel, tzDayKey } from "./tz";

/** UTC+5 bo'yicha berilgan sana-vaqt. */
const at = (day: string, hh: number, mm = 0) =>
  new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000+05:00`);

describe("currentShift", () => {
  it("09:00–18:00 — kunduzgi", () => {
    expect(currentShift(at("2026-07-28", 9))).toBe("DAY");
    expect(currentShift(at("2026-07-28", 13))).toBe("DAY");
    expect(currentShift(at("2026-07-28", 17, 59))).toBe("DAY");
  });

  it("18:00–09:00 — kechki", () => {
    expect(currentShift(at("2026-07-28", 18))).toBe("NIGHT");
    expect(currentShift(at("2026-07-28", 23))).toBe("NIGHT");
    expect(currentShift(at("2026-07-28", 3))).toBe("NIGHT");
    expect(currentShift(at("2026-07-28", 8, 59))).toBe("NIGHT");
  });

  it("server lokal vaqtiga tayanmaydi — UTC+5 bo'yicha hisoblaydi", () => {
    // 05:00 UTC = 10:00 Toshkent → kunduzgi (lokal UTC bo'lsa ham)
    expect(currentShift(new Date("2026-07-28T05:00:00.000Z"))).toBe("DAY");
    // 14:00 UTC = 19:00 Toshkent → kechki
    expect(currentShift(new Date("2026-07-28T14:00:00.000Z"))).toBe("NIGHT");
  });
});

describe("shiftRange", () => {
  it("kunduzgi — bugun 09:00 dan 18:00 gacha", () => {
    const r = shiftRange("DAY", at("2026-07-28", 13));
    expect(tzDayKey(r.start)).toBe("2026-07-28");
    expect(tzTimeLabel(r.start)).toBe("09:00");
    expect(tzTimeLabel(r.end)).toBe("18:00");
  });

  it("kechki, kechqurun — bugun 18:00 dan ertaga 09:00 gacha", () => {
    const r = shiftRange("NIGHT", at("2026-07-28", 20));
    expect(tzDayKey(r.start)).toBe("2026-07-28");
    expect(tzTimeLabel(r.start)).toBe("18:00");
    expect(tzDayKey(r.end)).toBe("2026-07-29");
    expect(tzTimeLabel(r.end)).toBe("09:00");
  });

  it("kechki, ertalab — kecha 18:00 dan bugun 09:00 gacha (yarim tunni kesadi)", () => {
    const r = shiftRange("NIGHT", at("2026-07-28", 3));
    expect(tzDayKey(r.start)).toBe("2026-07-27");
    expect(tzTimeLabel(r.start)).toBe("18:00");
    expect(tzDayKey(r.end)).toBe("2026-07-28");
    expect(tzTimeLabel(r.end)).toBe("09:00");
  });

  it("oyna har doim 'hozir'ni o'z ichiga oladi", () => {
    for (const h of [0, 5, 9, 12, 17, 18, 21, 23]) {
      const now = at("2026-07-28", h);
      const r = shiftRange(currentShift(now), now);
      expect(now >= r.start && now < r.end, `soat ${h}`).toBe(true);
    }
  });
});

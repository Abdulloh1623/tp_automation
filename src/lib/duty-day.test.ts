import { describe, it, expect } from "vitest";
import { isDutyRotationDay } from "./shift";

// UTC+5 (Toshkent) bo'yicha yakshanba. Sana UTC'da beriladi, shuning uchun
// chegara holatlari (00:00–05:00) alohida tekshiriladi — aynan shu oraliqda
// UTC hali oldingi kunda bo'ladi va lokal vaqtga tayangan hisob adashardi.
const at = (iso: string) => new Date(iso);

describe("isDutyRotationDay", () => {
  it("yakshanba kunduzi — navbat kuni", () => {
    // 2026-08-02 — yakshanba
    expect(isDutyRotationDay(at("2026-08-02T07:00:00Z"))).toBe(true); // 12:00 Toshkent
  });

  it("dushanba–shanba — jadval kuni", () => {
    expect(isDutyRotationDay(at("2026-07-27T07:00:00Z"))).toBe(false); // dushanba
    expect(isDutyRotationDay(at("2026-08-01T07:00:00Z"))).toBe(false); // shanba
  });

  it("shanba kechasi 21:00 UTC — Toshkentda allaqachon yakshanba", () => {
    // 2026-08-01 21:00 UTC = 2026-08-02 02:00 Toshkent (yakshanba)
    expect(isDutyRotationDay(at("2026-08-01T21:00:00Z"))).toBe(true);
  });

  it("yakshanba 20:00 UTC — Toshkentda allaqachon dushanba", () => {
    // 2026-08-02 20:00 UTC = 2026-08-03 01:00 Toshkent (dushanba)
    expect(isDutyRotationDay(at("2026-08-02T20:00:00Z"))).toBe(false);
  });

  it("yakshanba 00:30 Toshkent (shanba 19:30 UTC) — hali shanba", () => {
    expect(isDutyRotationDay(at("2026-08-01T18:30:00Z"))).toBe(false); // 23:30 shanba
  });
});

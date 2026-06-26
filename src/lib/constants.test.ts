import { describe, it, expect } from "vitest";
import {
  LEAD_OUTCOME,
  LEAD_STAGE,
  OUTCOME_TO_STAGE,
  ACTIVE_STAGES,
  LEAD_LIMITS,
  MISSED_OUTCOMES,
  normalizeRegion,
  parseRegions,
  REGIONS,
} from "./constants";

describe("OUTCOME_TO_STAGE — yaxlitlik", () => {
  it("har bir LEAD_OUTCOME uchun mapping bor", () => {
    for (const key of Object.keys(LEAD_OUTCOME)) {
      expect(OUTCOME_TO_STAGE).toHaveProperty(key);
    }
  });
  it("har bir mapping qiymati yaroqli LEAD_STAGE kaliti", () => {
    for (const stage of Object.values(OUTCOME_TO_STAGE)) {
      expect(LEAD_STAGE).toHaveProperty(stage);
    }
  });
  it("uskuna qaytarish → RETURNING", () => {
    expect(OUTCOME_TO_STAGE.RETURN_EQUIPMENT).toBe("RETURNING");
  });
  it("yo'naltirildi/muammo → boshliq navbatiga (ESCALATED)", () => {
    expect(OUTCOME_TO_STAGE.FORWARDED).toBe("ESCALATED");
    expect(OUTCOME_TO_STAGE.HAS_ISSUE).toBe("ESCALATED");
  });
});

describe("ACTIVE_STAGES", () => {
  it("faqat yaroqli stage kalitlaridan iborat", () => {
    for (const s of ACTIVE_STAGES) expect(LEAD_STAGE).toHaveProperty(s);
  });
  it("boshliq/usta navbatlarini o'z ichiga olmaydi", () => {
    expect(ACTIVE_STAGES).not.toContain("ESCALATED");
    expect(ACTIVE_STAGES).not.toContain("FORWARDED");
    expect(ACTIVE_STAGES).not.toContain("RETURNING");
  });
});

describe("MISSED_OUTCOMES", () => {
  it("faqat yaroqli outcome kalitlari", () => {
    for (const o of MISSED_OUTCOMES) expect(LEAD_OUTCOME).toHaveProperty(o);
  });
});

describe("LEAD_LIMITS", () => {
  it("6 ish kuni: kunlik 50, hafta 300, oy 1300", () => {
    expect(LEAD_LIMITS).toEqual({ daily: 50, weekly: 300, monthly: 1300 });
  });
});

describe("normalizeRegion", () => {
  it("imlo/eski variantlarni kanonga keltiradi", () => {
    expect(normalizeRegion("Surxandaryo")).toBe("Surxondaryo");
    expect(normalizeRegion("Toshkent shahri")).toBe("Toshkent");
    expect(normalizeRegion("Toshkent viloyati")).toBe("Toshkent");
    expect(normalizeRegion("fargona")).toBe("Farg'ona");
  });
  it("turli apostroflarni birlashtiradi", () => {
    expect(normalizeRegion("Farg‘ona")).toBe("Farg'ona");
  });
  it("bo'sh/null → null", () => {
    expect(normalizeRegion(null)).toBeNull();
    expect(normalizeRegion("")).toBeNull();
    expect(normalizeRegion("   ")).toBeNull();
  });
  it("kanonik qiymatlar o'zgarmaydi", () => {
    for (const r of REGIONS) expect(normalizeRegion(r)).toBe(r);
  });
});

describe("parseRegions", () => {
  it("vergulli regions + eski region ni birlashtiradi (dublikatsiz)", () => {
    expect(parseRegions("Toshkent, Andijon", "Andijon").sort()).toEqual(
      ["Andijon", "Toshkent"].sort()
    );
  });
  it("bo'sh kirish → bo'sh massiv", () => {
    expect(parseRegions(null, null)).toEqual([]);
  });
});

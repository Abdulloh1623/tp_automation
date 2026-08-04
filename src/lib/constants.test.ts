import { describe, it, expect } from "vitest";
import {
  LEAD_OUTCOME,
  LEAD_STAGE,
  OUTCOME_TO_STAGE,
  ACTIVE_STAGES,
  NO_CONTACT_STAGES,
  OFF_BOARD_STAGES,
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
  it("yo'naltirildi → boshliq navbatiga (ESCALATED)", () => {
    expect(OUTCOME_TO_STAGE.FORWARDED).toBe("ESCALATED");
  });
  it("muammo bor → alohida ISSUE_OPEN bosqichi, kunlik taxtadan chiqadi", () => {
    expect(OUTCOME_TO_STAGE.HAS_ISSUE).toBe("ISSUE_OPEN");
    expect(ACTIVE_STAGES).not.toContain("ISSUE_OPEN");
    expect(OFF_BOARD_STAGES).toContain("ISSUE_OPEN");
  });
  it("o'chirib qo'ydi — qaytarib olishga urinamiz, taxtada qoladi", () => {
    expect(ACTIVE_STAGES).toContain("DEACTIVATED");
    expect(NO_CONTACT_STAGES).toEqual(["REFUSED"]);
  });
  it("OFF_BOARD_STAGES — eskalatsiya/qaytarish/muammo, ACTIVE_STAGES bilan kesishmaydi", () => {
    for (const s of OFF_BOARD_STAGES) {
      expect(LEAD_STAGE).toHaveProperty(s);
      expect(ACTIVE_STAGES).not.toContain(s);
    }
    expect(OFF_BOARD_STAGES).toEqual(
      expect.arrayContaining(["ESCALATED", "FORWARDED", "RETURNING", "ISSUE_OPEN"]),
    );
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
  it("hafta 300, oy 1300 (kunlik kvota User.dailyLimit da)", () => {
    expect(LEAD_LIMITS).toEqual({ weekly: 300, monthly: 1300 });
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

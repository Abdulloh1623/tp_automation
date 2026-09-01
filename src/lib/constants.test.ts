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
  CUSTOM_FOCUS_SEGMENTS,
  validateCustomFocusShares,
  parseLeadFocusSelection,
  focusOrder,
  focusLabel,
  focusHint,
  focusSharesText,
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

describe("validateCustomFocusShares", () => {
  it("bo'sh ro'yxat rad etiladi", () => {
    const r = validateCustomFocusShares([]);
    expect(r.ok).toBe(false);
  });
  it("OTHERS tanlab bo'lmaydi (mezon emas — u avtomatik qolgan ulush)", () => {
    const r = validateCustomFocusShares([{ segment: "OTHERS", share: 10 }]);
    expect(r.ok).toBe(false);
  });
  it("takroriy mezon rad etiladi", () => {
    const r = validateCustomFocusShares([
      { segment: "DEBTOR", share: 30 },
      { segment: "DEBTOR", share: 20 },
    ]);
    expect(r.ok).toBe(false);
  });
  it("ulush 0 yoki 100 dan katta rad etiladi", () => {
    expect(validateCustomFocusShares([{ segment: "DEBTOR", share: 0 }]).ok).toBe(false);
    expect(validateCustomFocusShares([{ segment: "DEBTOR", share: 101 }]).ok).toBe(false);
  });
  it("yig'indi 100 dan oshsa rad etiladi", () => {
    const r = validateCustomFocusShares([
      { segment: "DEBTOR", share: 60 },
      { segment: "NEW", share: 50 },
    ]);
    expect(r.ok).toBe(false);
  });
  it("yaroqli ro'yxat qabul qilinadi", () => {
    const r = validateCustomFocusShares([
      { segment: "DEBTOR", share: 40 },
      { segment: "NEW", share: 20 },
    ]);
    expect(r).toEqual({
      ok: true,
      shares: [
        { segment: "DEBTOR", share: 40 },
        { segment: "NEW", share: 20 },
      ],
    });
  });
  it("CUSTOM_FOCUS_SEGMENTS OTHERS'ni o'z ichiga olmaydi", () => {
    expect(CUSTOM_FOCUS_SEGMENTS).not.toContain("OTHERS");
  });
});

describe("parseLeadFocusSelection", () => {
  it("eski format — yalang'och profil id satri", () => {
    expect(parseLeadFocusSelection("PAYMENT")).toEqual({ kind: "preset", id: "PAYMENT" });
  });
  it("yangi format — { kind: preset, id }", () => {
    expect(parseLeadFocusSelection({ kind: "preset", id: "HIGH_VALUE" })).toEqual({
      kind: "preset",
      id: "HIGH_VALUE",
    });
  });
  it("yangi format — { kind: custom, shares }", () => {
    expect(
      parseLeadFocusSelection({ kind: "custom", shares: [{ segment: "DEBTOR", share: 40 }] }),
    ).toEqual({ kind: "custom", shares: [{ segment: "DEBTOR", share: 40 }] });
  });
  it("buzuq qiymat — null", () => {
    expect(parseLeadFocusSelection("YO'Q_PROFIL")).toBeNull();
    expect(parseLeadFocusSelection({ kind: "custom", shares: "buzuq" })).toBeNull();
    expect(parseLeadFocusSelection(null)).toBeNull();
  });
});

describe("focusOrder / focusLabel / focusHint / focusSharesText", () => {
  it("preset — profileOrder bilan bir xil", () => {
    const sel = { kind: "preset" as const, id: "BALANCED" as const };
    expect(focusOrder(sel).length).toBeGreaterThan(0);
    expect(focusLabel(sel)).toBe("Muvozanat");
  });
  it("custom — OTHERS qolgan ulush bilan avtomatik qo'shiladi", () => {
    const sel = { kind: "custom" as const, shares: [{ segment: "DEBTOR" as const, share: 40 }] };
    expect(focusOrder(sel)).toEqual([
      { segment: "DEBTOR", share: 40 },
      { segment: "OTHERS", share: 60 },
    ]);
    expect(focusLabel(sel)).toBe("Maxsus");
    expect(focusHint(sel)).toMatch(/mezon/);
    expect(focusSharesText(sel)).toContain("Qarzdor 40%");
    expect(focusSharesText(sel)).toContain("Boshqalar 60%");
  });
  it("custom — yig'indi 100 bo'lsa OTHERS 0% qo'shiladi", () => {
    const sel = {
      kind: "custom" as const,
      shares: [
        { segment: "DEBTOR" as const, share: 60 },
        { segment: "NEW" as const, share: 40 },
      ],
    };
    expect(focusOrder(sel).at(-1)).toEqual({ segment: "OTHERS", share: 0 });
  });
});

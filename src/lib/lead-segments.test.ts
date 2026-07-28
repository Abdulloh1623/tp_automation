import { describe, it, expect } from "vitest";
import { classifyLead, isFloorLead, overdueDays, type SegmentInput } from "./lead-segments";
import { LEAD_PRIORITY_PROFILES, profileOrder, type LeadProfileId } from "./constants";

const DAY = 86400000;
const NOW = new Date("2026-07-28T09:00:00.000Z"); // UTC+5 bo'yicha 14:00
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);
const ahead = (n: number) => new Date(NOW.getTime() + n * DAY);

function client(over: Partial<SegmentInput> = {}): SegmentInput {
  return {
    stage: "NO_ANSWER",
    createdAt: ago(200),
    nextPaymentDate: ahead(20),
    nextContactDate: null,
    lastContactedAt: ago(1),
    missedCallCount: 0,
    monthlyAmount: 30,
    currency: "USD",
    ...over,
  };
}

const PAYMENT = profileOrder("PAYMENT");
const NEW_CLIENTS = profileOrder("NEW_CLIENTS");
const HIGH_VALUE = profileOrder("HIGH_VALUE");

describe("overdueDays", () => {
  it("to'lov muddati kelmagan mijoz — 0", () => {
    expect(overdueDays(client(), NOW)).toBe(0);
  });
  it("kechikkan kunlarni sanaydi", () => {
    expect(overdueDays(client({ nextPaymentDate: ago(12) }), NOW)).toBe(12);
  });
});

describe("classifyLead", () => {
  it("30 kundan ortiq qarz — eski qarzdor", () => {
    expect(classifyLead(client({ nextPaymentDate: ago(45) }), PAYMENT, NOW)).toBe("DEBTOR_OLD");
  });

  it("kam kunlik qarz — oddiy qarzdor", () => {
    expect(classifyLead(client({ nextPaymentDate: ago(5) }), PAYMENT, NOW)).toBe("DEBTOR");
  });

  it("to'lovga 2 kun qolgan — DUE_SOON (hali qarz emas)", () => {
    expect(classifyLead(client({ nextPaymentDate: ahead(2) }), PAYMENT, NOW)).toBe("DUE_SOON");
  });

  it("yangi qo'shilgan mijoz — NEW", () => {
    const c = client({ createdAt: ago(3), stage: "LATER" });
    expect(classifyLead(c, NEW_CLIENTS, NOW)).toBe("NEW");
  });

  it("profil tartibi klassifikatsiyani o'zgartiradi", () => {
    // Qarzdor + yirik mijoz: "To'lov" fokusida qarz, "Yirik" fokusida yiriklik yutadi
    const c = client({ nextPaymentDate: ago(40), monthlyAmount: 250 });
    expect(classifyLead(c, PAYMENT, NOW)).toBe("DEBTOR_OLD");
    expect(classifyLead(c, HIGH_VALUE, NOW)).toBe("HIGH_VALUE");
  });

  it("UZS mijoz yiriklik qoidasiga tushmaydi", () => {
    const c = client({ monthlyAmount: 5_000_000, currency: "UZS" });
    expect(classifyLead(c, HIGH_VALUE, NOW)).not.toBe("HIGH_VALUE");
  });

  it("hech bir segmentga tushmasa — OTHERS", () => {
    expect(classifyLead(client(), PAYMENT, NOW)).toBe("OTHERS");
  });
});

describe("isFloorLead (majburiy pol)", () => {
  it("aynan bugunga va'da berilgan — majburiy", () => {
    expect(isFloorLead(client({ nextContactDate: NOW }), NOW)).toBe(true);
  });

  it("muddati o'tgan va'da — majburiy EMAS (pol tor bo'lishi kerak)", () => {
    expect(isFloorLead(client({ nextContactDate: ago(3) }), NOW)).toBe(false);
  });

  it("60 kundan ortiq qarzdor — majburiy", () => {
    expect(isFloorLead(client({ nextPaymentDate: ago(70) }), NOW)).toBe(true);
  });

  it("oddiy lid — majburiy emas", () => {
    expect(isFloorLead(client(), NOW)).toBe(false);
  });
});

describe("profil ta'riflari", () => {
  const ids = Object.keys(LEAD_PRIORITY_PROFILES) as LeadProfileId[];

  it("har profil ulushlari yig'indisi 100", () => {
    for (const id of ids) {
      const sum = LEAD_PRIORITY_PROFILES[id].shares.reduce((s, x) => s + x.share, 0);
      expect(sum, id).toBe(100);
    }
  });

  it("OTHERS har profilda va oxirgi o'rinda (qolgani yo'qolmasin)", () => {
    for (const id of ids) {
      const shares = LEAD_PRIORITY_PROFILES[id].shares;
      expect(shares[shares.length - 1].segment, id).toBe("OTHERS");
    }
  });

  it("qarzdorlik ulushi hech bir profilda 20% dan past emas", () => {
    for (const id of ids) {
      const debt = LEAD_PRIORITY_PROFILES[id].shares
        .filter((s) => s.segment === "DEBTOR" || s.segment === "DEBTOR_OLD")
        .reduce((s, x) => s + x.share, 0);
      expect(debt, id).toBeGreaterThanOrEqual(20);
    }
  });

  it("segment profil ichida takrorlanmaydi", () => {
    for (const id of ids) {
      const segs = LEAD_PRIORITY_PROFILES[id].shares.map((s) => s.segment);
      expect(new Set(segs).size, id).toBe(segs.length);
    }
  });
});

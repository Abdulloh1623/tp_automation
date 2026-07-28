import { describe, it, expect } from "vitest";
import {
  ALL_OUTCOMES,
  DEFAULT_LOAD_POLICY,
  DEFAULT_RECALL_RULES,
  autoDailyLimit,
  capForNewClient,
  computeNextContact,
  mergeLoadPolicy,
  mergeRecallRules,
} from "./recall-rules";

const NOW = new Date("2026-07-28T09:00:00.000Z");
const DAY = 86400000;
const noPayment = { nextPaymentDate: null };

describe("DEFAULT_RECALL_RULES", () => {
  it("har bir natija uchun qoida bor", () => {
    for (const o of ALL_OUTCOMES) expect(DEFAULT_RECALL_RULES[o], o).toBeDefined();
  });

  it("standartlar kelishilgan jadvalga mos", () => {
    // Ertasi kuni qayta bog'lanish
    for (const o of ["NO_ANSWER", "PHONE_OFF", "BUSY", "CALL_LATER", "WILL_PAY",
      "WILL_PAY_TOMORROW", "HAS_ISSUE", "RESOLVED", "DEACTIVATED"] as const) {
      expect(DEFAULT_RECALL_RULES[o], o).toEqual({ mode: "DAYS", days: 1 });
    }
    // 3 kundan so'ng
    for (const o of ["NO_PROBLEM", "SUGGESTION", "PAID"] as const) {
      expect(DEFAULT_RECALL_RULES[o], o).toEqual({ mode: "DAYS", days: 3 });
    }
    // To'lov kuni yaqin bo'lsa o'sha kuni, uzoq bo'lsa 3 kundan keyin
    expect(DEFAULT_RECALL_RULES.PAYMENT_REMINDED).toEqual({
      mode: "PAYMENT_OR_DAYS",
      days: 3,
    });
    // Boshqa oqimga o'tadiganlar
    for (const o of ["FORWARDED", "RETURN_EQUIPMENT", "REFUSED"] as const) {
      expect(DEFAULT_RECALL_RULES[o].mode, o).toBe("NONE");
    }
  });
});

describe("computeNextContact", () => {
  it("KUN rejimi — bugundan N kun keyin", () => {
    const d = computeNextContact("NO_PROBLEM", noPayment, DEFAULT_RECALL_RULES, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("TO'LOV SANASI rejimi — mijozning to'lov sanasi", () => {
    const rules = mergeRecallRules({ PAID: { mode: "PAYMENT_DATE", days: 30 } });
    const pay = new Date("2026-08-15T00:00:00.000Z");
    const d = computeNextContact("PAID", { nextPaymentDate: pay }, rules, NOW);
    expect(d).toEqual(pay);
  });

  it("to'lov sanasi yo'q bo'lsa — zaxira kun ishlatiladi", () => {
    const rules = mergeRecallRules({ PAID: { mode: "PAYMENT_DATE", days: 30 } });
    const d = computeNextContact("PAID", noPayment, rules, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it("KUN YOKI TO'LOV — to'lov kuni yaqin bo'lsa o'sha kun olinadi", () => {
    const pay = new Date(NOW.getTime() + 1 * DAY);
    const d = computeNextContact(
      "PAYMENT_REMINDED",
      { nextPaymentDate: pay },
      DEFAULT_RECALL_RULES,
      NOW,
    );
    expect(d).toEqual(pay);
  });

  it("KUN YOKI TO'LOV — to'lov kuni uzoq bo'lsa 3 kun olinadi", () => {
    const pay = new Date(NOW.getTime() + 20 * DAY);
    const d = computeNextContact(
      "PAYMENT_REMINDED",
      { nextPaymentDate: pay },
      DEFAULT_RECALL_RULES,
      NOW,
    );
    expect(d!.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("ALOQA YO'Q — sana qo'yilmaydi (boshqa oqimga o'tadi)", () => {
    expect(computeNextContact("REFUSED", noPayment, DEFAULT_RECALL_RULES, NOW)).toBeNull();
    expect(computeNextContact("FORWARDED", noPayment, DEFAULT_RECALL_RULES, NOW)).toBeNull();
    expect(computeNextContact("RETURN_EQUIPMENT", noPayment, DEFAULT_RECALL_RULES, NOW)).toBeNull();
  });

  it("muammo bor / o'chirib qo'ydi — ertasi kuni bog'lanamiz", () => {
    for (const o of ["HAS_ISSUE", "DEACTIVATED"] as const) {
      const d = computeNextContact(o, noPayment, DEFAULT_RECALL_RULES, NOW);
      expect(d!.getTime(), o).toBe(NOW.getTime() + 1 * DAY);
    }
  });

  it("admin kiritgan qiymat standartni almashtiradi", () => {
    const rules = mergeRecallRules({ NO_ANSWER: { mode: "DAYS", days: 7 } });
    const d = computeNextContact("NO_ANSWER", noPayment, rules, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 7 * DAY);
  });
});

describe("capForNewClient (yangi mijoz oralig'i)", () => {
  const policy = { newClientMonths: 3, newClientMaxDays: 3 };
  const newClient = { contractDate: new Date(NOW.getTime() - 30 * DAY), createdAt: NOW };
  const oldClient = { contractDate: new Date(NOW.getTime() - 300 * DAY), createdAt: NOW };

  it("yangi mijozning uzoq oralig'i chegaraga tortiladi", () => {
    const far = new Date(NOW.getTime() + 30 * DAY);
    const d = capForNewClient(far, newClient, policy, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("yangi mijozning yaqin oralig'i tegilmaydi (1 kun 3 ga cho'zilmaydi)", () => {
    const soon = new Date(NOW.getTime() + 1 * DAY);
    expect(capForNewClient(soon, newClient, policy, NOW)).toEqual(soon);
  });

  it("eski mijozga qo'llanmaydi", () => {
    const far = new Date(NOW.getTime() + 30 * DAY);
    expect(capForNewClient(far, oldClient, policy, NOW)).toEqual(far);
  });

  it("otkaz/uskuna qaytarish (sana yo'q) tegilmaydi", () => {
    expect(capForNewClient(null, newClient, policy, NOW)).toBeNull();
  });

  it("shartnoma sanasi yo'q bo'lsa createdAt bo'yicha", () => {
    const far = new Date(NOW.getTime() + 30 * DAY);
    const d = capForNewClient(far, { contractDate: null, createdAt: NOW }, policy, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("qoida o'chirilgan bo'lsa (0 oy) tegilmaydi", () => {
    const far = new Date(NOW.getTime() + 30 * DAY);
    const off = { newClientMonths: 0, newClientMaxDays: 3 };
    expect(capForNewClient(far, newClient, off, NOW)).toEqual(far);
  });
});

describe("mergeRecallRules", () => {
  it("bo'sh/yaroqsiz kirish — sof standartlar", () => {
    expect(mergeRecallRules(null)).toEqual(DEFAULT_RECALL_RULES);
    expect(mergeRecallRules("matn")).toEqual(DEFAULT_RECALL_RULES);
  });

  it("noma'lum natija va yaroqsiz qiymatlar e'tiborsiz qoldiriladi", () => {
    const rules = mergeRecallRules({
      YOQ_NATIJA: { mode: "DAYS", days: 5 },
      NO_ANSWER: { mode: "NOTOGRI", days: 5 },
      BUSY: { mode: "DAYS", days: -3 },
      CALL_LATER: { mode: "DAYS", days: 9999 },
    });
    expect(rules).toEqual(DEFAULT_RECALL_RULES);
  });

  it("bitta buzuq qator qolganini ishdan chiqarmaydi", () => {
    const rules = mergeRecallRules({
      BUSY: { mode: "DAYS", days: -3 }, // buzuq
      NO_PROBLEM: { mode: "DAYS", days: 10 }, // to'g'ri
    });
    expect(rules.BUSY).toEqual(DEFAULT_RECALL_RULES.BUSY);
    expect(rules.NO_PROBLEM).toEqual({ mode: "DAYS", days: 10 });
  });
});

describe("mergeLoadPolicy", () => {
  it("standartlar qaytadi", () => {
    expect(mergeLoadPolicy(null)).toEqual(DEFAULT_LOAD_POLICY);
  });

  it("chegaradan tashqari qiymatlar e'tiborsiz", () => {
    const p = mergeLoadPolicy({ maxPerOperator: 9999, escalationThreshold: 0 });
    expect(p.maxPerOperator).toBe(DEFAULT_LOAD_POLICY.maxPerOperator);
    expect(p.escalationThreshold).toBe(DEFAULT_LOAD_POLICY.escalationThreshold);
  });

  it("eng kam eng ko'pdan oshib ketmaydi", () => {
    const p = mergeLoadPolicy({ minPerOperator: 40, maxPerOperator: 20 });
    expect(p.minPerOperator).toBe(20);
    expect(p.maxPerOperator).toBe(20);
  });
});

describe("autoDailyLimit", () => {
  const policy = { ...DEFAULT_LOAD_POLICY, minPerOperator: 10, maxPerOperator: 50 };

  it("ro'yxatni operatorlarga teng bo'ladi", () => {
    expect(autoDailyLimit(60, 3, policy)).toBe(20);
  });

  it("qoldiq bo'lsa yuqoriga yaxlitlaydi (hech kim tashlanmasin)", () => {
    expect(autoDailyLimit(61, 3, policy)).toBe(21);
  });

  it("eng kam chegaradan pastga tushmaydi", () => {
    expect(autoDailyLimit(6, 3, policy)).toBe(10);
  });

  it("eng ko'p chegaradan oshmaydi", () => {
    expect(autoDailyLimit(1000, 3, policy)).toBe(50);
  });

  it("operator yo'q — 0", () => {
    expect(autoDailyLimit(100, 0, policy)).toBe(0);
  });
});

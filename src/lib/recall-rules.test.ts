import { describe, it, expect } from "vitest";
import {
  ALL_OUTCOMES,
  DEFAULT_LOAD_POLICY,
  DEFAULT_RECALL_RULES,
  autoDailyLimit,
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

  it("standartlar eski qotib qolgan qiymatlarni takrorlaydi", () => {
    expect(DEFAULT_RECALL_RULES.NO_ANSWER).toEqual({ mode: "DAYS", days: 1 });
    expect(DEFAULT_RECALL_RULES.CALL_LATER).toEqual({ mode: "DAYS", days: 2 });
    expect(DEFAULT_RECALL_RULES.NO_PROBLEM).toEqual({ mode: "DAYS", days: 4 });
    expect(DEFAULT_RECALL_RULES.WILL_PAY_TOMORROW).toEqual({ mode: "DAYS", days: 1 });
    expect(DEFAULT_RECALL_RULES.WILL_PAY.mode).toBe("PAYMENT_DATE");
    expect(DEFAULT_RECALL_RULES.REFUSED.mode).toBe("NONE");
  });
});

describe("computeNextContact", () => {
  it("KUN rejimi — bugundan N kun keyin", () => {
    const d = computeNextContact("CALL_LATER", noPayment, DEFAULT_RECALL_RULES, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 2 * DAY);
  });

  it("TO'LOV SANASI rejimi — mijozning to'lov sanasi", () => {
    const pay = new Date("2026-08-15T00:00:00.000Z");
    const d = computeNextContact("WILL_PAY", { nextPaymentDate: pay }, DEFAULT_RECALL_RULES, NOW);
    expect(d).toEqual(pay);
  });

  it("to'lov sanasi yo'q bo'lsa — zaxira kun ishlatiladi", () => {
    const d = computeNextContact("WILL_PAY", noPayment, DEFAULT_RECALL_RULES, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("ALOQA YO'Q — sana qo'yilmaydi", () => {
    expect(computeNextContact("REFUSED", noPayment, DEFAULT_RECALL_RULES, NOW)).toBeNull();
    expect(computeNextContact("HAS_ISSUE", noPayment, DEFAULT_RECALL_RULES, NOW)).toBeNull();
  });

  it("admin kiritgan qiymat standartni almashtiradi", () => {
    const rules = mergeRecallRules({ NO_ANSWER: { mode: "DAYS", days: 7 } });
    const d = computeNextContact("NO_ANSWER", noPayment, rules, NOW);
    expect(d!.getTime()).toBe(NOW.getTime() + 7 * DAY);
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

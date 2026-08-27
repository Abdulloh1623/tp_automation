import { describe, it, expect } from "vitest";
import { computeFinanceOverview, emptyMoney, type FinanceClientRow } from "./finance";

function client(over: Partial<FinanceClientRow> = {}): FinanceClientRow {
  return {
    status: "ACTIVE",
    stage: "NEW",
    currency: "USD",
    monthlyAmount: 30,
    nextPaymentDate: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    deactivatedAt: null,
    ...over,
  };
}

describe("emptyMoney", () => {
  it("nolli USD/UZS obyekti", () => {
    expect(emptyMoney()).toEqual({ USD: 0, UZS: 0 });
  });
});

describe("computeFinanceOverview — MRR va faol/nofaol", () => {
  it("faol, oyligi bor mijozlar MRR ga qo'shiladi", () => {
    const r = computeFinanceOverview(
      [client({ monthlyAmount: 30, currency: "USD" }), client({ monthlyAmount: 500000, currency: "UZS" })],
      1,
    );
    expect(r.mrr).toEqual({ USD: 30, UZS: 500000 });
    expect(r.activeClients).toBe(2);
    expect(r.totalClients).toBe(2);
  });

  it("INACTIVE status yoki NO_CONTACT bosqich (masalan REFUSED) — churn, MRR ga kirmaydi", () => {
    const r = computeFinanceOverview(
      [
        client({ status: "INACTIVE", monthlyAmount: 30 }),
        client({ stage: "REFUSED", monthlyAmount: 40 }),
        client({ monthlyAmount: 30 }),
      ],
      1,
    );
    expect(r.mrr.USD).toBe(30);
    expect(r.activeClients).toBe(1);
    expect(r.inactiveClients).toBe(2);
  });

  it("oyligi 0 bo'lgan faol mijoz MRR'ga qo'shilmaydi, lekin churn ham emas", () => {
    const r = computeFinanceOverview([client({ monthlyAmount: 0 })], 1);
    expect(r.mrr).toEqual({ USD: 0, UZS: 0 });
    expect(r.activeClients).toBe(0);
    expect(r.inactiveClients).toBe(0);
  });
});

describe("computeFinanceOverview — qarzdorlik yoshi", () => {
  const now = new Date("2026-08-27T00:00:00.000Z");

  it("muddati o'tmagan to'lov overdue'ga kirmaydi", () => {
    const r = computeFinanceOverview(
      [client({ nextPaymentDate: new Date("2026-09-01T00:00:00.000Z") })],
      1,
      now,
    );
    expect(r.overdueCount).toBe(0);
  });

  it("kunlar bo'yicha to'g'ri savatga tushadi (30/60/90/90+)", () => {
    const r = computeFinanceOverview(
      [
        client({ nextPaymentDate: new Date("2026-08-10T00:00:00.000Z") }), // 17 kun -> b30
        client({ nextPaymentDate: new Date("2026-07-10T00:00:00.000Z") }), // 48 kun -> b60
        client({ nextPaymentDate: new Date("2026-06-01T00:00:00.000Z") }), // 87 kun -> b90
        client({ nextPaymentDate: new Date("2026-01-01T00:00:00.000Z") }), // 90+ kun -> b90plus
      ],
      1,
      now,
    );
    expect(r.overdueCount).toBe(4);
    const byKey = Object.fromEntries(r.aging.map((b) => [b.key, b.count]));
    expect(byKey).toEqual({ b30: 1, b60: 1, b90: 1, b90plus: 1 });
  });

  it("churn bo'lgan mijoz qarzdor bo'lsa ham hisoblanmaydi", () => {
    const r = computeFinanceOverview(
      [client({ status: "INACTIVE", nextPaymentDate: new Date("2026-01-01T00:00:00.000Z") })],
      1,
      now,
    );
    expect(r.overdueCount).toBe(0);
  });
});

describe("computeFinanceOverview — oylik dinamika va churn kohorti", () => {
  it("shu oy yaratilgan mijoz newCount'ga kiradi", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const r = computeFinanceOverview([client({ createdAt: new Date("2026-08-05T00:00:00.000Z") })], 1, now);
    expect(r.months.at(-1)!.newCount).toBe(1);
    expect(r.newThisMonth).toBe(1);
  });

  it("shu oy churn bo'lgan mijoz lostCount'ga kiradi", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const r = computeFinanceOverview(
      [
        client({
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          deactivatedAt: new Date("2026-08-10T00:00:00.000Z"),
          status: "INACTIVE",
        }),
      ],
      1,
      now,
    );
    expect(r.months.at(-1)!.lostCount).toBe(1);
    expect(r.lostThisMonth).toBe(1);
  });

  it("churnRate faqat oy boshida faol bo'lganlar populyatsiyasidan hisoblanadi", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    // 2 ta oy boshida faol, 1 tasi shu oy churn -> 50%.
    // Oy ICHIDA yaratilib, oy ICHIDA churn bo'lgan mijoz (3-si) bu nisbatga kirmaydi.
    const r = computeFinanceOverview(
      [
        client({ createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        client({
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          deactivatedAt: new Date("2026-08-05T00:00:00.000Z"),
          status: "INACTIVE",
        }),
        client({
          createdAt: new Date("2026-08-02T00:00:00.000Z"),
          deactivatedAt: new Date("2026-08-03T00:00:00.000Z"),
          status: "INACTIVE",
        }),
      ],
      1,
      now,
    );
    expect(r.months.at(-1)!.churnRate).toBe(50);
    expect(r.churnRate).toBe(50);
  });

  it("oy boshida hech kim faol bo'lmasa churnRate 0", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const r = computeFinanceOverview([], 1, now);
    expect(r.months.at(-1)!.churnRate).toBe(0);
  });

  it("monthsBack son-modelida oylar soni to'g'ri, eskidan yangiga tartiblangan", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const r = computeFinanceOverview([], 3, now);
    expect(r.months.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
});

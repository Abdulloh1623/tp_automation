import { describe, it, expect } from "vitest";
import { paymentState, paymentUrgency } from "./payment-status";

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

describe("paymentState", () => {
  it("sana yo'q → NONE", () => {
    expect(paymentState(null)).toBe("NONE");
    expect(paymentState(undefined)).toBe("NONE");
  });
  it("o'tgan sana → OVERDUE", () => {
    expect(paymentState(daysFromNow(-1))).toBe("OVERDUE");
    expect(paymentState(daysFromNow(-30))).toBe("OVERDUE");
  });
  it("bugun → DUE_TODAY", () => {
    expect(paymentState(daysFromNow(0))).toBe("DUE_TODAY");
  });
  it("5 kun ichida → DUE_SOON", () => {
    expect(paymentState(daysFromNow(1))).toBe("DUE_SOON");
    expect(paymentState(daysFromNow(5))).toBe("DUE_SOON");
  });
  it("5 kundan keyin → OK", () => {
    expect(paymentState(daysFromNow(6))).toBe("OK");
    expect(paymentState(daysFromNow(40))).toBe("OK");
  });
});

describe("paymentUrgency — shoshilinch tartibi", () => {
  it("OVERDUE eng shoshilinch, NONE eng oxirgi", () => {
    expect(paymentUrgency("OVERDUE")).toBeLessThan(paymentUrgency("DUE_TODAY"));
    expect(paymentUrgency("DUE_TODAY")).toBeLessThan(paymentUrgency("DUE_SOON"));
    expect(paymentUrgency("DUE_SOON")).toBeLessThan(paymentUrgency("OK"));
    expect(paymentUrgency("OK")).toBeLessThan(paymentUrgency("NONE"));
  });
});

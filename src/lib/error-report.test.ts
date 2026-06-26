import { describe, it, expect } from "vitest";
import { formatErrorReport, shouldSend } from "./error-report";

const now = new Date("2026-06-26T09:30:00Z");

describe("formatErrorReport", () => {
  it("xato nomi va xabarini o'z ichiga oladi", () => {
    const msg = formatErrorReport(new Error("baza yiqildi"), { source: "server" }, now);
    expect(msg).toContain("Xatolik");
    expect(msg).toContain("Error");
    expect(msg).toContain("baza yiqildi");
  });

  it("kontekst (manba/yo'l/metod) ni qo'shadi", () => {
    const msg = formatErrorReport(new Error("x"), {
      source: "server",
      path: "/lidlar",
      method: "POST",
      routeType: "action",
    }, now);
    expect(msg).toContain("/lidlar");
    expect(msg).toContain("action");
    expect(msg).toContain("POST");
  });

  it("HTML maxsus belgilarni ekranlaydi (injection himoyasi)", () => {
    const msg = formatErrorReport(new Error("<script>alert(1)</script>"), {}, now);
    expect(msg).not.toContain("<script>");
    expect(msg).toContain("&lt;script&gt;");
  });

  it("Error bo'lmagan qiymatni ham qabul qiladi", () => {
    const msg = formatErrorReport("oddiy satr xato", {}, now);
    expect(msg).toContain("oddiy satr xato");
  });

  it("juda uzun xabarni qisqartiradi", () => {
    const long = "a".repeat(5000);
    const msg = formatErrorReport(new Error(long), {}, now);
    expect(msg.length).toBeLessThan(3000);
  });
});

describe("shouldSend — spam himoyasi (throttle)", () => {
  it("birinchi marta true, oraliq ichida takror false", () => {
    const sig = "sig-A";
    expect(shouldSend(sig, 1_000, 60_000)).toBe(true);
    expect(shouldSend(sig, 5_000, 60_000)).toBe(false); // 4s o'tdi < 60s
  });

  it("oraliqdan keyin yana true", () => {
    const sig = "sig-B";
    expect(shouldSend(sig, 1_000, 60_000)).toBe(true);
    expect(shouldSend(sig, 70_000, 60_000)).toBe(true); // 69s o'tdi > 60s
  });

  it("har xil signature mustaqil", () => {
    expect(shouldSend("sig-C", 1_000, 60_000)).toBe(true);
    expect(shouldSend("sig-D", 1_000, 60_000)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { isEscalationStage, escalationStagePatch } from "./escalation";

describe("isEscalationStage", () => {
  it("ESCALATED va FORWARDED — ha", () => {
    expect(isEscalationStage("ESCALATED")).toBe(true);
    expect(isEscalationStage("FORWARDED")).toBe(true);
  });
  it("boshqa bosqichlar va bo'sh — yo'q", () => {
    expect(isEscalationStage("NEW")).toBe(false);
    expect(isEscalationStage("RESOLVED")).toBe(false);
    expect(isEscalationStage(null)).toBe(false);
  });
});

describe("escalationStagePatch", () => {
  it("eskalatsiyaga birinchi kirishда escalatedAt qo'yiladi, SLA nollanadi", () => {
    const p = escalationStagePatch("ESCALATED", { stage: "NEW", escalatedAt: null });
    expect(p.escalatedAt).toBeInstanceOf(Date);
    expect(p.slaNotifiedAt).toBeNull();
  });

  it("davom etayotgan eskalatsiyada (ESCALATED→FORWARDED) vaqt saqlanadi", () => {
    const t = new Date("2026-07-10T00:00:00Z");
    const p = escalationStagePatch("FORWARDED", { stage: "ESCALATED", escalatedAt: t });
    expect(p).toEqual({}); // o'zgarish yo'q — escalatedAt saqlanadi
  });

  it("escalatedAt yo'q bo'lsa (eski yozuv) qayta kirishда qo'yiladi", () => {
    const p = escalationStagePatch("FORWARDED", { stage: "ESCALATED", escalatedAt: null });
    expect(p.escalatedAt).toBeInstanceOf(Date);
  });

  it("eskalatsiyadan chiqishда (→RESOLVED) barcha belgilar tozalanadi", () => {
    const t = new Date("2026-07-10T00:00:00Z");
    const p = escalationStagePatch("RESOLVED", { stage: "FORWARDED", escalatedAt: t });
    expect(p).toEqual({ escalatedAt: null, escalationStaffId: null, slaNotifiedAt: null });
  });

  it("eskalatsiyaga aloqasi yo'q o'tishда bo'sh patch", () => {
    const p = escalationStagePatch("NO_ANSWER", { stage: "NEW", escalatedAt: null });
    expect(p).toEqual({});
  });
});

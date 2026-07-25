import { describe, it, expect } from "vitest";
import {
  isEscalationStage,
  escalationStagePatch,
  shouldEscalate,
  autoEscalationTarget,
} from "./escalation";
import { ESCALATION_THRESHOLD } from "./constants";

describe("shouldEscalate", () => {
  it("chegaradan kam ketma-ket ko'tarilmasa — eskalatsiya YO'Q", () => {
    expect(shouldEscalate(0)).toBe(false);
    expect(shouldEscalate(ESCALATION_THRESHOLD - 1)).toBe(false);
  });
  it("aynan chegarada — eskalatsiya BOR (>= mantiq)", () => {
    expect(shouldEscalate(ESCALATION_THRESHOLD)).toBe(true);
  });
  it("chegaradan ko'p bo'lsa — eskalatsiya BOR", () => {
    expect(shouldEscalate(ESCALATION_THRESHOLD + 1)).toBe(true);
  });
});

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

describe("autoEscalationTarget", () => {
  it("oddiy mijoz — eskalatsiyaga, izohda '3 marta ketma-ket' va 'tizim'", () => {
    const r = autoEscalationTarget(3, 50, "USD");
    expect(r.stage).toBe("ESCALATED");
    expect(r.note).toContain("3 marta ketma-ket");
    expect(r.note).toContain("Tizim tomonidan");
  });
  it("oylik 29$ (USD) — otkazga o'tadi, izoh bilan", () => {
    const r = autoEscalationTarget(3, 29, "USD");
    expect(r.stage).toBe("REFUSED");
    expect(r.note).toContain("otkaz");
    expect(r.note).toContain("29$");
  });
  it("29 lekin UZS — otkaz EMAS (faqat 29$ USD)", () => {
    expect(autoEscalationTarget(3, 29, "UZS").stage).toBe("ESCALATED");
  });
  it("29$ atrofidagi qiymat (masalan 28.99/29.01) — 29 emas, eskalatsiya", () => {
    expect(autoEscalationTarget(3, 30, "USD").stage).toBe("ESCALATED");
    expect(autoEscalationTarget(3, 29.5, "USD").stage).toBe("ESCALATED");
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

  it("eskalatsiyaga kirishда mas'ul avtomatik mijoz operatoriga biriktiriladi", () => {
    const p = escalationStagePatch("ESCALATED", {
      stage: "NEW",
      escalatedAt: null,
      assignedToId: "op1",
      escalationStaffId: null,
    });
    expect(p.escalationStaffId).toBe("op1");
    expect(p.escalatedAt).toBeInstanceOf(Date);
  });

  it("mas'ul allaqachon biriktirilgan bo'lsa — qayta yozilmaydi", () => {
    const p = escalationStagePatch("ESCALATED", {
      stage: "NEW",
      escalatedAt: null,
      assignedToId: "op1",
      escalationStaffId: "op2",
    });
    expect(p.escalationStaffId).toBeUndefined();
  });

  it("operatori yo'q (assignedToId null) — mas'ul patchга qo'shilmaydi (Yangi'da qoladi)", () => {
    const p = escalationStagePatch("ESCALATED", {
      stage: "NEW",
      escalatedAt: null,
      assignedToId: null,
      escalationStaffId: null,
    });
    expect(p.escalationStaffId).toBeUndefined();
    expect(p.escalatedAt).toBeInstanceOf(Date);
  });
});

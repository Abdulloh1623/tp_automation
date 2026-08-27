import { describe, it, expect } from "vitest";
import { rankUstasByResolved, type ResolvedEscalation } from "./escalation-stats";

function log(result: string, calledAt: string) {
  return { result, calledAt: new Date(calledAt) };
}

describe("rankUstasByResolved", () => {
  it("assignedUstaId yo'q yozuvlar tashlab ketiladi", () => {
    const r = rankUstasByResolved([{ assignedUstaId: null, assignedUsta: null, callLogs: [] }]);
    expect(r.ustaRanking).toEqual([]);
    expect(r.avgResolveHours).toBeNull();
  });

  it("bitta usta, bitta ish — hal qilish vaqti soatda to'g'ri hisoblanadi", () => {
    const resolved: ResolvedEscalation[] = [
      {
        assignedUstaId: "u1",
        assignedUsta: { name: "Jasur" },
        callLogs: [log("ASSIGNED", "2026-08-01T08:00:00.000Z"), log("DONE", "2026-08-01T11:00:00.000Z")],
      },
    ];
    const r = rankUstasByResolved(resolved);
    expect(r.ustaRanking).toEqual([{ ustaId: "u1", name: "Jasur", done: 1, avgHours: 3 }]);
    expect(r.avgResolveHours).toBe(3);
  });

  it("bir necha ASSIGNED/DONE bo'lsa — birinchi ASSIGNED va oxirgi DONE olinadi", () => {
    const resolved: ResolvedEscalation[] = [
      {
        assignedUstaId: "u1",
        assignedUsta: { name: "Jasur" },
        callLogs: [
          log("ASSIGNED", "2026-08-01T10:00:00.000Z"),
          log("ASSIGNED", "2026-08-01T08:00:00.000Z"), // eng erta — shu olinadi
          log("DONE", "2026-08-01T12:00:00.000Z"),
          log("DONE", "2026-08-01T14:00:00.000Z"), // eng kech — shu olinadi
        ],
      },
    ];
    const r = rankUstasByResolved(resolved);
    expect(r.ustaRanking[0].avgHours).toBe(6); // 08:00 -> 14:00
  });

  it("DONE ASSIGNED'dan oldin bo'lsa (yoki teng) — o'rtachaga kiritilmaydi, lekin ishlar soni sanaladi", () => {
    const resolved: ResolvedEscalation[] = [
      {
        assignedUstaId: "u1",
        assignedUsta: { name: "Jasur" },
        callLogs: [log("ASSIGNED", "2026-08-01T10:00:00.000Z"), log("DONE", "2026-08-01T10:00:00.000Z")],
      },
    ];
    const r = rankUstasByResolved(resolved);
    expect(r.ustaRanking[0].done).toBe(1);
    expect(r.ustaRanking[0].avgHours).toBeNull();
    expect(r.avgResolveHours).toBeNull();
  });

  it("ASSIGNED yoki DONE yozuvi umuman yo'q — ishlar soni sanaladi, vaqt yo'q", () => {
    const resolved: ResolvedEscalation[] = [
      { assignedUstaId: "u1", assignedUsta: { name: "Jasur" }, callLogs: [] },
    ];
    const r = rankUstasByResolved(resolved);
    expect(r.ustaRanking[0]).toEqual({ ustaId: "u1", name: "Jasur", done: 1, avgHours: null });
  });

  it("bir necha usta — done bo'yicha kamayish tartibida, top 5 bilan chegaralanadi", () => {
    const resolved: ResolvedEscalation[] = [
      ...Array.from({ length: 2 }, () => ({
        assignedUstaId: "u-low",
        assignedUsta: { name: "Kam" },
        callLogs: [] as { result: string; calledAt: Date }[],
      })),
      ...Array.from({ length: 5 }, () => ({
        assignedUstaId: "u-high",
        assignedUsta: { name: "Ko'p" },
        callLogs: [],
      })),
      { assignedUstaId: "u6", assignedUsta: { name: "F" }, callLogs: [] },
      { assignedUstaId: "u7", assignedUsta: { name: "G" }, callLogs: [] },
      { assignedUstaId: "u8", assignedUsta: { name: "H" }, callLogs: [] },
      { assignedUstaId: "u9", assignedUsta: { name: "I" }, callLogs: [] },
    ];
    const r = rankUstasByResolved(resolved);
    expect(r.ustaRanking).toHaveLength(5);
    expect(r.ustaRanking[0]).toMatchObject({ ustaId: "u-high", done: 5 });
    expect(r.ustaRanking[1]).toMatchObject({ ustaId: "u-low", done: 2 });
  });

  it("bir nechta usta — umumiy o'rtacha faqat vaqti o'lchangan ishlar bo'yicha", () => {
    const resolved: ResolvedEscalation[] = [
      {
        assignedUstaId: "u1",
        assignedUsta: { name: "A" },
        callLogs: [log("ASSIGNED", "2026-08-01T00:00:00.000Z"), log("DONE", "2026-08-01T02:00:00.000Z")],
      },
      {
        assignedUstaId: "u2",
        assignedUsta: { name: "B" },
        callLogs: [log("ASSIGNED", "2026-08-01T00:00:00.000Z"), log("DONE", "2026-08-01T06:00:00.000Z")],
      },
      { assignedUstaId: "u3", assignedUsta: { name: "C" }, callLogs: [] }, // o'lchanmagan
    ];
    const r = rankUstasByResolved(resolved);
    expect(r.avgResolveHours).toBe(4); // (2 + 6) / 2 — u3 hisobga kirmaydi
  });
});

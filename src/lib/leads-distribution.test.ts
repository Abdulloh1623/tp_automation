import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma, audit va sozlamalarni mock qilamiz — DB'siz orkestratsiya mantig'i.
const {
  userFindMany,
  clientFindMany,
  clientUpdateMany,
  callLogFindMany,
  logAudit,
  getActiveLeadProfile,
} = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  clientFindMany: vi.fn(),
  clientUpdateMany: vi.fn(),
  callLogFindMany: vi.fn(),
  logAudit: vi.fn(),
  getActiveLeadProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: userFindMany },
    client: { findMany: clientFindMany, updateMany: clientUpdateMany },
    callLog: { findMany: callLogFindMany },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit }));
vi.mock("@/lib/settings", () => ({ getActiveLeadProfile }));

import { distributeLeadsCore } from "./leads-distribution";

// updateMany har doim ta'sirlangan qatorlar sonini qaytaradi
const countByIds = ({ where }: { where: { id: { in: string[] } } }) =>
  Promise.resolve({ count: where.id.in.length });

const DAY = 86400000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const inDays = (n: number) => new Date(Date.now() + n * DAY);

/** To'liq maydonli lid — segmentlash uchun hamma ustun kerak. */
function lead(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    assignedToId: null,
    pendingStage: null,
    stage: "NO_ANSWER",
    createdAt: daysAgo(200),
    nextPaymentDate: inDays(20),
    nextContactDate: null,
    lastContactedAt: daysAgo(1),
    missedCallCount: 0,
    monthlyAmount: 30,
    currency: "USD",
    ...over,
  };
}

/** Biriktirilgan (assignedToId != null) chaqiruvlardagi barcha id'lar. */
function assignedIds() {
  return clientUpdateMany.mock.calls
    .filter((c) => c[0].data.assignedToId !== null)
    .flatMap((c) => c[0].where.id.in as string[]);
}

beforeEach(() => {
  vi.clearAllMocks();
  callLogFindMany.mockResolvedValue([]);
  getActiveLeadProfile.mockResolvedValue({
    id: "BALANCED",
    todayOnly: false,
    defaultId: "BALANCED",
  });
  clientUpdateMany.mockImplementation(countByIds);
});

describe("distributeLeadsCore", () => {
  it("faol operator yo'q → xato, pool ham so'ralmaydi", async () => {
    userFindMany.mockResolvedValue([]);
    const r = await distributeLeadsCore();
    expect(r).toEqual({ assigned: 0, operators: 0, error: "Faol operator yo'q" });
    expect(clientFindMany).not.toHaveBeenCalled();
    expect(clientUpdateMany).not.toHaveBeenCalled();
  });

  it("barcha lidlarni operatorlarga ulashadi (yo'qotishsiz)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }, { id: "op2" }]);
    clientFindMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.operators).toBe(2);
    expect(r.assigned).toBe(5);
    expect(assignedIds().sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("sig'imdan ortgani ertangi kunga qoldiriladi (assignedToId=null)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]); // 1 operator × 50 = sig'im 50
    clientFindMany.mockResolvedValue(Array.from({ length: 53 }, (_, i) => lead(`c${i}`)));

    const r = await distributeLeadsCore();
    expect(r.assigned).toBe(50);

    const overflowCall = clientUpdateMany.mock.calls.find((c) => c[0].data.assignedToId === null);
    expect(overflowCall).toBeTruthy();
    expect(overflowCall![0].where.id.in.length).toBe(3); // 53 - 50
  });

  it("hech bir operator kunlik limitdan (50) oshmaydi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }, { id: "op2" }]);
    clientFindMany.mockResolvedValue(Array.from({ length: 130 }, (_, i) => lead(`c${i}`)));

    await distributeLeadsCore();
    for (const call of clientUpdateMany.mock.calls) {
      if (call[0].data.assignedToId !== null) {
        expect(call[0].where.id.in.length).toBeLessThanOrEqual(50);
      }
    }
  });

  it("eski qarzdorlar (majburiy pol) fokusdan qat'i nazar taqsimlanadi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    // 60 ta yangi mijoz + 3 ta 90 kunlik qarzdor; sig'im 50 — pol bo'lmasa
    // qarzdorlar tushib qolishi mumkin edi.
    const pool = [
      ...Array.from({ length: 60 }, (_, i) =>
        lead(`new${i}`, { stage: "NEW", createdAt: daysAgo(2) }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        lead(`debt${i}`, { nextPaymentDate: daysAgo(90) }),
      ),
    ];
    clientFindMany.mockResolvedValue(pool);
    // Fokus "yangi mijozlar" — qarzdorlarni ataylab pastga suradi
    getActiveLeadProfile.mockResolvedValue({
      id: "NEW_CLIENTS",
      todayOnly: true,
      defaultId: "BALANCED",
    });

    const r = await distributeLeadsCore();
    expect(r.floor).toBe(3);
    const ids = assignedIds();
    expect(ids).toContain("debt0");
    expect(ids).toContain("debt1");
    expect(ids).toContain("debt2");
  });

  it("bugunga va'da berilgan lid majburiy polga kiradi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    clientFindMany.mockResolvedValue([
      lead("promise", { nextContactDate: new Date() }),
      lead("boshqa"),
    ]);
    const r = await distributeLeadsCore();
    expect(r.floor).toBe(1);
    expect(assignedIds()).toContain("promise");
  });

  it("fokus profili ulushni belgilaydi (to'lov vs yangi mijozlar)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]); // sig'im 50
    const pool = [
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`debt${i}`, { nextPaymentDate: daysAgo(10) }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`new${i}`, { stage: "NEW", createdAt: daysAgo(2) }),
      ),
    ];
    clientFindMany.mockResolvedValue(pool);

    getActiveLeadProfile.mockResolvedValue({
      id: "PAYMENT",
      todayOnly: false,
      defaultId: "BALANCED",
    });
    await distributeLeadsCore();
    const payFocus = assignedIds();
    expect(payFocus.length).toBe(50);
    expect(payFocus.filter((id) => id.startsWith("debt")).length).toBeGreaterThanOrEqual(40);

    vi.clearAllMocks();
    clientUpdateMany.mockImplementation(countByIds);
    callLogFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    clientFindMany.mockResolvedValue(pool);
    getActiveLeadProfile.mockResolvedValue({
      id: "NEW_CLIENTS",
      todayOnly: false,
      defaultId: "BALANCED",
    });
    await distributeLeadsCore();
    const newFocus = assignedIds();
    expect(newFocus.length).toBe(50);
    expect(newFocus.filter((id) => id.startsWith("new")).length).toBeGreaterThanOrEqual(40);
  });

  it("hech bir segment butunlay tushib qolmaydi (fokus = filtr emas)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    clientFindMany.mockResolvedValue([
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`debt${i}`, { nextPaymentDate: daysAgo(10) }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        lead(`new${i}`, { stage: "NEW", createdAt: daysAgo(2) }),
      ),
    ]);
    getActiveLeadProfile.mockResolvedValue({
      id: "PAYMENT",
      todayOnly: false,
      defaultId: "BALANCED",
    });

    await distributeLeadsCore();
    // "To'lov yig'ish" fokusida ham yangi mijozlarga joy qoladi
    expect(assignedIds().filter((id) => id.startsWith("new")).length).toBeGreaterThan(0);
  });

  it("bugun ishlangan lid egasida qoladi va uning kvotasini band qiladi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    clientFindMany.mockResolvedValue([
      lead("ishlangan", { assignedToId: "op1", pendingStage: "LATER" }),
      ...Array.from({ length: 60 }, (_, i) => lead(`c${i}`)),
    ]);

    const r = await distributeLeadsCore();
    expect(r.kept).toBe(1);
    // 50 - 1 (band) = 49 ta yangi biriktirish
    expect(r.assigned).toBe(49);
    const all = clientUpdateMany.mock.calls.flatMap((c) => c[0].where.id.in as string[]);
    expect(all).not.toContain("ishlangan"); // umuman tegilmaydi
  });

  it("bugun qo'ng'iroq qilingan lid ham egasida qoladi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    callLogFindMany.mockResolvedValue([{ clientId: "tegilgan" }]);
    clientFindMany.mockResolvedValue([
      lead("tegilgan", { assignedToId: "op1" }),
      lead("c1"),
    ]);

    const r = await distributeLeadsCore();
    expect(r.kept).toBe(1);
    const all = clientUpdateMany.mock.calls.flatMap((c) => c[0].where.id.in as string[]);
    expect(all).not.toContain("tegilgan");
  });

  it("taqsimotdan keyin audit yoziladi (fokus nomi bilan)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    clientFindMany.mockResolvedValue([lead("c0")]);
    await distributeLeadsCore();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][1].detail).toContain("Muvozanat");
  });
});

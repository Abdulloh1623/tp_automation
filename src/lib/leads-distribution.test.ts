import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma va audit'ni mock qilamiz — DB'siz orkestratsiya mantig'ini tekshiramiz.
const { userFindMany, clientFindMany, clientUpdateMany, logAudit } = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  clientFindMany: vi.fn(),
  clientUpdateMany: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: userFindMany },
    client: { findMany: clientFindMany, updateMany: clientUpdateMany },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit }));

import { distributeLeadsCore } from "./leads-distribution";

// updateMany har doim ta'sirlangan qatorlar sonini qaytaradi
const countByIds = ({ where }: { where: { id: { in: string[] } } }) =>
  Promise.resolve({ count: where.id.in.length });

beforeEach(() => vi.clearAllMocks());

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
    const pool = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` }));
    clientFindMany.mockResolvedValue(pool);
    clientUpdateMany.mockImplementation(countByIds);

    const r = await distributeLeadsCore();
    expect(r.operators).toBe(2);
    expect(r.assigned).toBe(5);

    // Biriktirilgan (assignedToId != null) chaqiruvlardagi barcha id'lar = butun pool
    const assignedIds = clientUpdateMany.mock.calls
      .filter((c) => c[0].data.assignedToId !== null)
      .flatMap((c) => c[0].where.id.in);
    expect(assignedIds.sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("sig'imdan ortgani ertangi kunga qoldiriladi (assignedToId=null)", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]); // 1 operator × 50 = sig'im 50
    const pool = Array.from({ length: 53 }, (_, i) => ({ id: `c${i}` }));
    clientFindMany.mockResolvedValue(pool);
    clientUpdateMany.mockImplementation(countByIds);

    const r = await distributeLeadsCore();
    expect(r.assigned).toBe(50); // faqat 50 biriktirildi

    const overflowCall = clientUpdateMany.mock.calls.find((c) => c[0].data.assignedToId === null);
    expect(overflowCall).toBeTruthy();
    expect(overflowCall![0].where.id.in.length).toBe(3); // 53 - 50
  });

  it("hech bir operator kunlik limitdan (50) oshmaydi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }, { id: "op2" }]);
    const pool = Array.from({ length: 130 }, (_, i) => ({ id: `c${i}` }));
    clientFindMany.mockResolvedValue(pool);
    clientUpdateMany.mockImplementation(countByIds);

    await distributeLeadsCore();
    for (const call of clientUpdateMany.mock.calls) {
      if (call[0].data.assignedToId !== null) {
        expect(call[0].where.id.in.length).toBeLessThanOrEqual(50);
      }
    }
  });

  it("taqsimotdan keyin audit yoziladi", async () => {
    userFindMany.mockResolvedValue([{ id: "op1" }]);
    clientFindMany.mockResolvedValue([{ id: "c0" }]);
    clientUpdateMany.mockImplementation(countByIds);
    await distributeLeadsCore();
    expect(logAudit).toHaveBeenCalledTimes(1);
  });
});

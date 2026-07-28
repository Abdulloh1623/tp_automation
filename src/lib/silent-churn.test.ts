import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  clientFindMany: vi.fn(),
  userFindMany: vi.fn(),
  createNotification: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("./db", () => ({
  db: { client: { findMany: m.clientFindMany }, user: { findMany: m.userFindMany } },
}));
vi.mock("./notifications", () => ({ createNotification: m.createNotification }));
vi.mock("./telegram", async () => {
  const actual = await vi.importActual<typeof import("./telegram")>("./telegram");
  return { ...actual, sendMessage: m.sendMessage };
});

import { getSilentChurn, SILENT_CHURN_STATUSES } from "./silent-churn";
import { runSilentChurnCheck } from "./silent-churn-alert";

const client = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  restaurantName: "Osh Markazi",
  phone: "998901112233",
  region: "Toshkent",
  monthlyAmount: 29,
  currency: "USD",
  biznexStatus: "EXPIRED",
  biznexCheckedAt: new Date("2026-07-28T00:00:00Z"),
  assignedTo: { name: "Aziza" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.createNotification.mockResolvedValue("n1");
  m.sendMessage.mockResolvedValue(undefined);
});

describe("getSilentChurn", () => {
  it("faqat faol, obunasi tugagan, otkaz bo'lmagan mijozlarni so'raydi", async () => {
    m.clientFindMany.mockResolvedValue([]);
    await getSilentChurn();
    const where = m.clientFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("ACTIVE");
    expect(where.biznexStatus).toEqual({ in: [...SILENT_CHURN_STATUSES] });
    expect(where.stage.notIn).toEqual(["REFUSED"]);
  });

  it("NOT_FOUND jim churn hisoblanmaydi (bu ma'lumot sifati muammosi)", () => {
    expect([...SILENT_CHURN_STATUSES]).not.toContain("NOT_FOUND");
  });

  it("xavf ostidagi MRR'ni valyutalar bo'yicha alohida yig'adi", async () => {
    m.clientFindMany.mockResolvedValue([
      client({ id: "a", monthlyAmount: 29, currency: "USD" }),
      client({ id: "b", monthlyAmount: 49, currency: "USD" }),
      client({ id: "c", monthlyAmount: 500000, currency: "UZS" }),
    ]);
    const r = await getSilentChurn();
    expect(r.count).toBe(3);
    expect(r.atRisk).toEqual({ USD: 78, UZS: 500000 });
  });

  it("limit ro'yxatni kesadi, LEKIN summa to'liq to'plam bo'yicha qoladi", async () => {
    m.clientFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => client({ id: `c${i}`, monthlyAmount: 10 })),
    );
    const r = await getSilentChurn(2);
    expect(r.clients).toHaveLength(2);
    expect(r.count).toBe(5);
    expect(r.atRisk.USD).toBe(50); // kesilgan ro'yxat bo'yicha 20 bo'lib qolmasin
  });

  it("biriktirilmagan mijozda operator nomi null", async () => {
    m.clientFindMany.mockResolvedValue([client({ assignedTo: null })]);
    const r = await getSilentChurn();
    expect(r.clients[0].operatorName).toBeNull();
  });
});

describe("runSilentChurnCheck", () => {
  it("hech kim yo'q — bildirishnoma ham, Telegram ham yuborilmaydi", async () => {
    m.clientFindMany.mockResolvedValue([]);
    const r = await runSilentChurnCheck();
    expect(r).toEqual({ count: 0, notified: 0, telegram: 0 });
    expect(m.createNotification).not.toHaveBeenCalled();
    expect(m.sendMessage).not.toHaveBeenCalled();
    expect(m.userFindMany).not.toHaveBeenCalled();
  });

  it("boshliqlarga bildirishnoma va Telegram yuboradi", async () => {
    m.clientFindMany.mockResolvedValue([client()]);
    m.userFindMany.mockResolvedValue([
      { id: "a1", telegramId: "111" },
      { id: "m1", telegramId: null }, // Telegramsiz — bildirishnoma baribir boradi
    ]);

    const r = await runSilentChurnCheck();
    expect(r).toEqual({ count: 1, notified: 2, telegram: 1 });

    const n = m.createNotification.mock.calls[0][0];
    expect(n.userIds).toEqual(["a1", "m1"]);
    expect(n.body).toContain("Osh Markazi");
    expect(n.body).toContain("MRR xavf ostida");

    expect(m.sendMessage).toHaveBeenCalledTimes(1);
    expect(m.sendMessage.mock.calls[0][0]).toBe("111");
  });

  it("ko'p mijozda ro'yxat qisqartiriladi va qoldig'i aytiladi", async () => {
    m.clientFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => client({ id: `c${i}`, restaurantName: `R${i}` })),
    );
    m.userFindMany.mockResolvedValue([{ id: "a1", telegramId: "111" }]);

    const r = await runSilentChurnCheck();
    expect(r.count).toBe(20);
    expect(m.createNotification.mock.calls[0][0].body).toContain("va yana 12 ta");
  });

  it("bitta Telegram yuborilmasa qolganlari to'xtamaydi", async () => {
    m.clientFindMany.mockResolvedValue([client()]);
    m.userFindMany.mockResolvedValue([
      { id: "a1", telegramId: "111" },
      { id: "a2", telegramId: "222" },
    ]);
    m.sendMessage.mockRejectedValueOnce(new Error("bloklangan"));

    const r = await runSilentChurnCheck();
    expect(r.telegram).toBe(1);
    expect(m.sendMessage).toHaveBeenCalledTimes(2);
  });
});

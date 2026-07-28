import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  getBiznexSubscription: vi.fn(),
}));

vi.mock("./db", () => ({ db: { client: { findMany: m.findMany, update: m.update } } }));
vi.mock("./billing", async () => {
  const actual = await vi.importActual<typeof import("./billing")>("./billing");
  return { ...actual, getBiznexSubscription: m.getBiznexSubscription };
});

import { syncBiznex, biznexConfigured } from "./biznex-sync";

const sub = (over: Record<string, unknown> = {}) => ({
  status: "active",
  active: true,
  expiresAt: "2026-09-01T00:00:00.000Z",
  remainingDays: 30,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BIZNEX_API_URL = "https://api.example/admin";
  process.env.BIZNEX_STATIC_TOKEN = "tok";
  m.findMany.mockResolvedValue([{ id: "c1", restaurantName: "Osh", phone: "998901112233" }]);
  m.update.mockResolvedValue({});
});

describe("biznexConfigured", () => {
  it("env to'liq bo'lsa true", () => {
    expect(biznexConfigured()).toBe(true);
  });

  it("env yo'q bo'lsa false", () => {
    delete process.env.BIZNEX_STATIC_TOKEN;
    expect(biznexConfigured()).toBe(false);
  });
});

describe("syncBiznex", () => {
  it("sozlanmagan bo'lsa hech narsa qilmaydi", async () => {
    delete process.env.BIZNEX_API_URL;
    const r = await syncBiznex();
    expect(r.configured).toBe(false);
    expect(m.findMany).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });

  it("faol obuna — flag, sana va status yoziladi", async () => {
    m.getBiznexSubscription.mockResolvedValue(sub());
    const r = await syncBiznex();
    expect(r.updated).toBe(1);
    const data = m.update.mock.calls[0][0].data;
    expect(data.biznexStatus).toBe("ACTIVE");
    expect(data.status).toBe("ACTIVE");
    expect(data.nextPaymentDate).toBeInstanceOf(Date);
  });

  it("obunasi tugagan — EXPIRED va lokal status INACTIVE", async () => {
    m.getBiznexSubscription.mockResolvedValue(sub({ status: "expired", active: false }));
    await syncBiznex();
    const data = m.update.mock.calls[0][0].data;
    expect(data.biznexStatus).toBe("EXPIRED");
    expect(data.status).toBe("INACTIVE");
  });

  it("NOT_FOUND — flag yoziladi, LEKIN lokal billing tegilmaydi", async () => {
    m.getBiznexSubscription.mockResolvedValue(
      sub({ status: "not_found", active: false, expiresAt: null }),
    );
    const r = await syncBiznex();
    expect(r.notFound).toBe(1);
    const data = m.update.mock.calls[0][0].data;
    expect(data.biznexStatus).toBe("NOT_FOUND");
    expect(data.status).toBeUndefined();
    expect(data.nextPaymentDate).toBeUndefined();
  });

  it("unknown (API xato) — mavjud flag O'CHIRILMAYDI", async () => {
    m.getBiznexSubscription.mockResolvedValue(
      sub({ status: "unknown", active: false, expiresAt: null }),
    );
    const r = await syncBiznex();
    expect(r.skipped).toBe(1);
    expect(r.updated).toBe(0);
    expect(m.update).not.toHaveBeenCalled();
  });

  it("noto'g'ri expiresAt sanani buzmaydi", async () => {
    m.getBiznexSubscription.mockResolvedValue(sub({ expiresAt: "yaroqsiz" }));
    await syncBiznex();
    expect(m.update.mock.calls[0][0].data.nextPaymentDate).toBeUndefined();
  });

  it("--stale faqat tekshirilmaganlarni oladi", async () => {
    m.getBiznexSubscription.mockResolvedValue(sub());
    await syncBiznex({ staleOnly: true, limit: 10 });
    const args = m.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ biznexCheckedAt: null });
    expect(args.take).toBe(10);
  });
});

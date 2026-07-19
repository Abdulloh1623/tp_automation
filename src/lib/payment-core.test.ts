import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionPayload } from "./session";

// Barcha yon ta'sirlar mock: bu yerda tekshiriladigan narsa — TARIXIY to'lov
// mijozning `nextPaymentDate` sini surib yubormasligi.
const {
  clientFindUnique,
  clientUpdate,
  paymentCreate,
  paymentUpdate,
  paymentDelete,
  paymentFindFirst,
  saveReceiptMock,
  sendPaymentMock,
  logAuditMock,
} = vi.hoisted(() => ({
  clientFindUnique: vi.fn(),
  clientUpdate: vi.fn(),
  paymentCreate: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentDelete: vi.fn(),
  paymentFindFirst: vi.fn(),
  saveReceiptMock: vi.fn(),
  sendPaymentMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    client: { findUnique: clientFindUnique, update: clientUpdate },
    payment: {
      create: paymentCreate,
      update: paymentUpdate,
      delete: paymentDelete,
      findFirst: paymentFindFirst,
    },
  },
}));
vi.mock("./receipts", () => ({ saveReceipt: saveReceiptMock }));
vi.mock("./telegram", () => ({
  sendPaymentToChannel: sendPaymentMock,
  escapeHtml: (s: string) => s,
}));
vi.mock("./audit", () => ({ logAudit: logAuditMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { processPayment, planNextPayment, applyNextPaymentPlan } from "./payment-core";

const session: SessionPayload = {
  userId: "u1",
  name: "Test",
  username: "test",
  role: "ADMIN",
  version: 0,
};

const receipt = { buffer: Buffer.from("x"), mime: "image/png" };
const fields = { amount: 349000, currency: "UZS", days: 30, method: "CARD" };

// Mijozning joriy to'lov sanasi kelajakda
const FUTURE = new Date("2026-09-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  clientFindUnique.mockResolvedValue({
    id: "c1",
    restaurantName: "Foodo",
    fullName: "Ali",
    phone: "+998901112233",
    region: null,
    contractNumber: null,
    nextPaymentDate: FUTURE,
    contractDate: new Date("2026-01-14T12:00:00Z"),
    createdAt: new Date("2026-01-01T12:00:00Z"),
    phones: [],
  });
  paymentCreate.mockImplementation(({ data }) => Promise.resolve({ id: "p1", ...data }));
  saveReceiptMock.mockResolvedValue({ ok: true, relPath: "receipts/p1.png" });
  sendPaymentMock.mockResolvedValue({ ok: true });
});

describe("processPayment — odatiy (jonli) to'lov", () => {
  it("mijozning keyingi to'lov sanasini suradi va ACTIVE qiladi", async () => {
    await processPayment(session, "c1", fields, receipt);
    expect(clientUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { nextPaymentDate: expect.any(Date), status: "ACTIVE" },
    });
  });

  it("qamrovni mavjud nextPaymentDate dan boshlaydi (kelajakda bo'lsa)", async () => {
    await processPayment(session, "c1", fields, receipt);
    expect(paymentCreate.mock.calls[0][0].data.periodStart).toEqual(FUTURE);
  });

  it("to'lovlar kanaliga yuboradi", async () => {
    await processPayment(session, "c1", fields, receipt);
    expect(sendPaymentMock).toHaveBeenCalled();
  });
});

describe("processPayment — TARIXIY import", () => {
  const historical = { ...fields, paidAt: "2026-04-15T00:00:00.000Z" };

  it("mijozning to'lov sanasiga TEGMAYDI", async () => {
    await processPayment(session, "c1", historical, receipt, { historical: true });
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it("qamrovni chekning HAQIQIY sanasidan boshlaydi (bugundan emas)", async () => {
    await processPayment(session, "c1", historical, receipt, { historical: true });
    const data = paymentCreate.mock.calls[0][0].data;
    expect(data.periodStart).toEqual(new Date("2026-04-15T00:00:00.000Z"));
    // 15-aprel + 30 kun = 15-may
    expect(data.periodEnd).toEqual(new Date("2026-05-15T00:00:00.000Z"));
    expect(data.paidAt).toEqual(new Date("2026-04-15T00:00:00.000Z"));
  });

  it("kanalga xabar yubormaydi (eski to'lovlar bilan spam qilmaydi)", async () => {
    await processPayment(session, "c1", historical, receipt, { historical: true });
    expect(sendPaymentMock).not.toHaveBeenCalled();
  });

  it("auditda tarixiy ekani ko'rsatiladi", async () => {
    await processPayment(session, "c1", historical, receipt, { historical: true });
    expect(logAuditMock).toHaveBeenCalledWith(
      "Tarixiy to'lov import qilindi",
      expect.anything(),
    );
  });

  it("to'lov yozuvi baribir yaratiladi", async () => {
    const res = await processPayment(session, "c1", historical, receipt, {
      historical: true,
    });
    expect(res).toEqual({ ok: true, paymentId: "p1" });
  });
});

describe("planNextPayment — reja (YOZMAYDI)", () => {
  it("hech qachon o'zi yozmaydi", async () => {
    paymentFindFirst.mockResolvedValue({ periodEnd: new Date("2026-05-15T00:00:00Z") });
    await planNextPayment(["c1"]);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it("eng oxirgi to'lovning periodEnd ini oladi", async () => {
    paymentFindFirst.mockResolvedValue({ periodEnd: new Date("2026-10-15T00:00:00Z") });
    const [row] = await planNextPayment(["c1"]);
    expect(row.next).toEqual(new Date("2026-10-15T00:00:00Z"));
  });

  // Bu ENG MUHIM holat: import qilingan tarix mijozning butun tarixini
  // qamramaydi, shuning uchun hisoblangan sana orqaga surilishi mumkin —
  // to'lovi joyida mijoz qarzdorga aylanadi. Skript buni ajratib ko'rsatadi.
  it("orqaga surilishni 'backward' deb belgilaydi", async () => {
    paymentFindFirst.mockResolvedValue({ periodEnd: new Date("2026-05-15T00:00:00Z") });
    const [row] = await planNextPayment(["c1"]); // hozirgi = 2026-09-01
    expect(row.direction).toBe("backward");
    expect(row.current).toEqual(FUTURE);
  });

  it("oldinga surilishni 'forward' deb belgilaydi", async () => {
    paymentFindFirst.mockResolvedValue({ periodEnd: new Date("2026-12-01T00:00:00Z") });
    const [row] = await planNextPayment(["c1"]);
    expect(row.direction).toBe("forward");
  });

  it("o'zgarmasa 'same'", async () => {
    paymentFindFirst.mockResolvedValue({ periodEnd: FUTURE });
    const [row] = await planNextPayment(["c1"]);
    expect(row.direction).toBe("same");
  });

  it("to'lov bo'lmasa shartnoma sanasidan hisoblaydi", async () => {
    paymentFindFirst.mockResolvedValue(null);
    const [row] = await planNextPayment(["c1"]);
    // contractDate 14-yanvar → keyingi oylik 14-kun
    expect(row.next.getDate()).toBe(14);
  });

  it("mijoz topilmasa o'tkazib yuboradi", async () => {
    clientFindUnique.mockResolvedValue(null);
    expect(await planNextPayment(["yo'q"])).toEqual([]);
  });
});

describe("applyNextPaymentPlan", () => {
  const row = (direction: "forward" | "backward" | "same") => ({
    clientId: "c1",
    restaurantName: "Foodo",
    current: FUTURE,
    next: new Date("2026-12-01T00:00:00Z"),
    direction,
  });

  it("forward va backward qatorlarni yozadi", async () => {
    expect(await applyNextPaymentPlan([row("forward"), row("backward")])).toBe(2);
    expect(clientUpdate).toHaveBeenCalledTimes(2);
  });

  it("'same' qatorlarni o'tkazib yuboradi", async () => {
    expect(await applyNextPaymentPlan([row("same")])).toBe(0);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it("bo'sh rejada hech narsa qilmaydi", async () => {
    expect(await applyNextPaymentPlan([])).toBe(0);
  });
});

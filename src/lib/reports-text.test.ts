import { describe, it, expect, vi, beforeEach } from "vitest";

// Butun Prisma qatlamini mock qilamiz — matn qurilishini (smena bloki) tekshiramiz.
const m = vi.hoisted(() => ({
  paymentFindMany: vi.fn(),
  callLogFindMany: vi.fn(),
  clientFindMany: vi.fn(),
  clientCount: vi.fn(),
  ticketCount: vi.fn(),
  userFindMany: vi.fn(),
  getActiveLeadProfile: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    payment: { findMany: m.paymentFindMany },
    callLog: { findMany: m.callLogFindMany },
    client: { findMany: m.clientFindMany, count: m.clientCount },
    ticket: { count: m.ticketCount },
    user: { findMany: m.userFindMany },
  },
}));
vi.mock("./settings", () => ({ getActiveLeadProfile: m.getActiveLeadProfile }));
vi.mock("./render-image", () => ({ svgToPng: () => Buffer.from("") }));

import { buildShiftReport } from "./reports";

const user = (id: string, name: string, shift: string, over = {}) => ({
  id,
  name,
  role: "OPERATOR",
  shift,
  isActive: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.paymentFindMany.mockResolvedValue([]);
  m.callLogFindMany.mockResolvedValue([]);
  m.clientFindMany.mockResolvedValue([]);
  m.clientCount.mockResolvedValue(0);
  m.ticketCount.mockResolvedValue(0);
  m.userFindMany.mockResolvedValue([]);
  m.getActiveLeadProfile.mockResolvedValue({
    id: "PAYMENT",
    todayOnly: true,
    defaultId: "BALANCED",
  });
});

describe("buildShiftReport", () => {
  it("kechki hisobotda smena xodimlari sanaladi, ishlamagani belgilanadi", async () => {
    m.userFindMany.mockResolvedValue([
      user("n1", "Kechki Ali", "NIGHT"),
      user("n2", "Kechki Vali", "NIGHT"),
      user("d1", "Kunduzgi Hasan", "DAY"),
    ]);
    m.callLogFindMany.mockResolvedValue([
      { result: "TALKED", operatorId: "n1" },
      { result: "NO_ANSWER", operatorId: "n1" },
    ]);

    const text = await buildShiftReport("shift-night");
    expect(text).toContain("Kechki smena hisoboti");
    expect(text).toContain("<b>Smena xodimlari (2):</b>");
    expect(text).toContain("Kechki Ali — 2 qo'ng'iroq");
    // Ishlamagan smena xodimi ko'rinadi va belgilanadi
    expect(text).toContain("Kechki Vali — 0 qo'ng'iroq, yig'im 0 ⚠️");
    // Ishlamagan boshqa smena xodimi umuman chiqmaydi
    expect(text).not.toContain("Kunduzgi Hasan");
  });

  it("oynada ishlagan boshqa smena xodimi alohida bo'limda chiqadi", async () => {
    m.userFindMany.mockResolvedValue([
      user("n1", "Kechki Ali", "NIGHT"),
      user("d1", "Kunduzgi Hasan", "DAY"),
    ]);
    m.callLogFindMany.mockResolvedValue([{ result: "TALKED", operatorId: "d1" }]);

    const text = await buildShiftReport("shift-night");
    expect(text).toContain("<i>Boshqa smenadan ishlaganlar:</i>");
    expect(text).toContain("Kunduzgi Hasan — 1 qo'ng'iroq");
  });

  it("smenaga xodim biriktirilmagan bo'lsa aniq aytiladi", async () => {
    m.userFindMany.mockResolvedValue([user("d1", "Kunduzgi Hasan", "DAY")]);
    const text = await buildShiftReport("shift-night");
    expect(text).toContain("Bu smenaga xodim biriktirilmagan");
  });

  it("kunduzgi hisobotda kunlik fokus qatori bor", async () => {
    const text = await buildShiftReport("shift-day");
    expect(text).toContain("Kunduzgi smena hisoboti");
    expect(text).toContain("🎯 Fokus:");
    expect(text).toContain("To'lov yig'ish");
  });

  it("kechki hisobotda fokus qatori YO'Q (kun almashgan bo'ladi)", async () => {
    const text = await buildShiftReport("shift-night");
    expect(text).not.toContain("🎯 Fokus:");
    expect(m.getActiveLeadProfile).not.toHaveBeenCalled();
  });
});

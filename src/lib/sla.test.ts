import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma, telegram va bildirishnomani mock qilamiz — DB'siz SLA mantig'ini tekshiramiz.
const {
  userFindMany,
  ticketFindMany,
  ticketUpdate,
  clientFindMany,
  clientUpdate,
  sendMessage,
  createNotification,
} = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  ticketFindMany: vi.fn(),
  ticketUpdate: vi.fn(),
  clientFindMany: vi.fn(),
  clientUpdate: vi.fn(),
  sendMessage: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    user: { findMany: userFindMany },
    ticket: { findMany: ticketFindMany, update: ticketUpdate },
    client: { findMany: clientFindMany, update: clientUpdate },
  },
}));
vi.mock("./telegram", () => ({
  sendMessage,
  escapeHtml: (s: string) => s,
}));
vi.mock("./notifications", () => ({ createNotification }));

import { runSlaCheck } from "./sla";

const NOW = new Date("2026-07-15T10:00:00.000Z");
const FOUR_DAYS_AGO = new Date("2026-07-11T09:00:00.000Z"); // SLA (3 kun) buzilgan
const YESTERDAY = new Date("2026-07-14T10:00:00.000Z");
const EARLIER_TODAY = new Date("2026-07-15T08:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  userFindMany.mockResolvedValue([{ id: "mgr1", telegramId: "tg-mgr" }]);
  ticketFindMany.mockResolvedValue([]);
  clientFindMany.mockResolvedValue([]);
  ticketUpdate.mockResolvedValue({});
  clientUpdate.mockResolvedValue({});
  sendMessage.mockResolvedValue({ ok: true });
  createNotification.mockResolvedValue(undefined);
});

function ticket(slaNotifiedAt: Date | null) {
  return {
    id: "t1",
    title: "Kassa ishlamayapti",
    createdAt: FOUR_DAYS_AGO,
    slaNotifiedAt,
    client: { restaurantName: "Osh Markazi" },
    assignedStaff: null,
  };
}

function escClient(slaNotifiedAt: Date | null) {
  return {
    id: "c1",
    restaurantName: "Osh Markazi",
    escalatedAt: FOUR_DAYS_AGO,
    updatedAt: FOUR_DAYS_AGO,
    slaNotifiedAt,
    escalationStaff: null,
  };
}

describe("runSlaCheck — kunlik qayta ogohlantirish", () => {
  it("hali ogohlantirilmagan (3 kundan oshgan) muammo — yuboradi va sanani belgilaydi", async () => {
    ticketFindMany.mockResolvedValue([ticket(null)]);
    const r = await runSlaCheck(NOW);
    expect(r.tickets).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(ticketUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { slaNotifiedAt: NOW },
    });
  });

  it("KECHA ogohlantirilgan — bugun QAYTA yuboriladi (har kunlik takror)", async () => {
    ticketFindMany.mockResolvedValue([ticket(YESTERDAY)]);
    const r = await runSlaCheck(NOW);
    expect(r.tickets).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it("BUGUN allaqachon ogohlantirilgan — qayta yuborilmaydi (kuniga bir marta)", async () => {
    ticketFindMany.mockResolvedValue([ticket(EARLIER_TODAY)]);
    const r = await runSlaCheck(NOW);
    expect(r.tickets).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    expect(ticketUpdate).not.toHaveBeenCalled();
  });

  it("eskalatsiya kecha ogohlantirilgan — bugun qayta yuboriladi", async () => {
    clientFindMany.mockResolvedValue([escClient(YESTERDAY)]);
    const r = await runSlaCheck(NOW);
    expect(r.escalations).toBe(1);
    expect(clientUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { slaNotifiedAt: NOW },
    });
  });

  it("eskalatsiya bugun ogohlantirilgan — o'tkazib yuboriladi", async () => {
    clientFindMany.mockResolvedValue([escClient(EARLIER_TODAY)]);
    const r = await runSlaCheck(NOW);
    expect(r.escalations).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  notifCount,
  clientCount,
  ticketCount,
  returnCount,
  suggestionCount,
} = vi.hoisted(() => ({
  notifCount: vi.fn(),
  clientCount: vi.fn(),
  ticketCount: vi.fn(),
  returnCount: vi.fn(),
  suggestionCount: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    notificationRecipient: { count: notifCount },
    client: { count: clientCount },
    ticket: { count: ticketCount },
    equipmentReturnRequest: { count: returnCount },
    suggestion: { count: suggestionCount },
  },
}));

import { getNavBadges } from "./nav-badges";

beforeEach(() => {
  vi.clearAllMocks();
  notifCount.mockResolvedValue(2);
  clientCount.mockResolvedValue(5); // lidlar + eskalatsiya (ikkalasi ham)
  ticketCount.mockResolvedValue(3);
  returnCount.mockResolvedValue(4);
  suggestionCount.mockResolvedValue(7);
});

describe("getNavBadges", () => {
  it("boshliq (MANAGER) — barcha bo'limlar sanaladi", async () => {
    const b = await getNavBadges("u1", "MANAGER");
    expect(b["/bildirishnomalar"]).toBe(2);
    expect(b["/muammolar"]).toBe(3);
    expect(b["/qaytarish"]).toBe(4);
    expect(b["/takliflar"]).toBe(7);
    expect(returnCount).toHaveBeenCalledTimes(1);
    expect(suggestionCount).toHaveBeenCalledTimes(1);
  });

  it("operator — boshliq navbatlari (qaytarish/taklif) so'ralmaydi, 0 qaytadi", async () => {
    const b = await getNavBadges("u1", "OPERATOR");
    expect(b["/qaytarish"]).toBe(0);
    expect(b["/takliflar"]).toBe(0);
    expect(returnCount).not.toHaveBeenCalled();
    expect(suggestionCount).not.toHaveBeenCalled();
    // O'ziga tegishli bo'limlar baribir sanaladi
    expect(b["/muammolar"]).toBe(3);
    expect(b["/lidlar"]).toBe(5);
  });

  it("har doim barcha kalitlar mavjud (nol bo'lsa ham)", async () => {
    const b = await getNavBadges("u1", "OPERATOR");
    for (const href of [
      "/bildirishnomalar",
      "/lidlar",
      "/muammolar",
      "/eskalatsiya",
      "/qaytarish",
      "/takliflar",
    ]) {
      expect(b).toHaveProperty(href);
    }
  });
});

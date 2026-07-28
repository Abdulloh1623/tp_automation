import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, upsert, deleteMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { appSetting: { findMany, upsert, deleteMany, findUnique: vi.fn() } },
}));

import { getActiveLeadProfile, setLeadProfile } from "./settings";
import { tzDayKey } from "./tz";

const NOW = new Date("2026-07-28T09:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({});
  deleteMany.mockResolvedValue({});
});

describe("getActiveLeadProfile", () => {
  it("sozlama yo'q — standart profil", async () => {
    findMany.mockResolvedValue([]);
    expect(await getActiveLeadProfile(NOW)).toEqual({
      id: "BALANCED",
      todayOnly: false,
      defaultId: "BALANCED",
    });
  });

  it("doimiy profil o'qiladi", async () => {
    findMany.mockResolvedValue([{ key: "leadPriorityProfile", value: "REENGAGE" }]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.id).toBe("REENGAGE");
    expect(r.todayOnly).toBe(false);
  });

  it("bugungi override doimiy profildan ustun", async () => {
    findMany.mockResolvedValue([
      { key: "leadPriorityProfile", value: "BALANCED" },
      {
        key: "leadPriorityOverride",
        value: JSON.stringify({ day: tzDayKey(NOW), profile: "PAYMENT" }),
      },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r).toEqual({ id: "PAYMENT", todayOnly: true, defaultId: "BALANCED" });
  });

  it("kechagi override e'tiborsiz — doimiy profil qaytadi", async () => {
    findMany.mockResolvedValue([
      { key: "leadPriorityProfile", value: "BALANCED" },
      {
        key: "leadPriorityOverride",
        value: JSON.stringify({ day: "2026-07-27", profile: "PAYMENT" }),
      },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.id).toBe("BALANCED");
    expect(r.todayOnly).toBe(false);
  });

  it("buzilgan qiymatlar tizimni to'xtatmaydi", async () => {
    findMany.mockResolvedValue([
      { key: "leadPriorityProfile", value: "YO'Q_PROFIL" },
      { key: "leadPriorityOverride", value: "{buzilgan json" },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.id).toBe("BALANCED");
  });
});

describe("setLeadProfile", () => {
  it("faqat bugunga — override yoziladi, doimiy tegilmaydi", async () => {
    await setLeadProfile("PAYMENT", true, NOW);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where.key).toBe("leadPriorityOverride");
    expect(JSON.parse(upsert.mock.calls[0][0].create.value)).toEqual({
      day: tzDayKey(NOW),
      profile: "PAYMENT",
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("doimiy — profil yoziladi va eski override o'chadi", async () => {
    await setLeadProfile("HIGH_VALUE", false, NOW);
    expect(upsert.mock.calls[0][0].where.key).toBe("leadPriorityProfile");
    expect(upsert.mock.calls[0][0].create.value).toBe("HIGH_VALUE");
    expect(deleteMany).toHaveBeenCalledWith({
      where: { key: "leadPriorityOverride" },
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, upsert, deleteMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { appSetting: { findMany, upsert, deleteMany, findUnique: vi.fn() } },
}));

import { getActiveLeadProfile, saveLeadFocusSelection } from "./settings";
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
      selection: { kind: "preset", id: "BALANCED" },
      todayOnly: false,
      defaultSelection: { kind: "preset", id: "BALANCED" },
    });
  });

  it("eski format (yalang'och profil id satri) o'qiladi", async () => {
    findMany.mockResolvedValue([{ key: "leadPriorityProfile", value: "REENGAGE" }]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.selection).toEqual({ kind: "preset", id: "REENGAGE" });
    expect(r.todayOnly).toBe(false);
  });

  it("yangi (JSON) formatdagi doimiy profil o'qiladi", async () => {
    findMany.mockResolvedValue([
      { key: "leadPriorityProfile", value: JSON.stringify({ kind: "preset", id: "HIGH_VALUE" }) },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.selection).toEqual({ kind: "preset", id: "HIGH_VALUE" });
  });

  it("maxsus (custom) doimiy tanlov o'qiladi", async () => {
    findMany.mockResolvedValue([
      {
        key: "leadPriorityProfile",
        value: JSON.stringify({
          kind: "custom",
          shares: [{ segment: "DEBTOR", share: 40 }],
        }),
      },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.selection).toEqual({
      kind: "custom",
      shares: [{ segment: "DEBTOR", share: 40 }],
    });
  });

  it("bugungi override (eski format) doimiy profildan ustun", async () => {
    findMany.mockResolvedValue([
      { key: "leadPriorityProfile", value: "BALANCED" },
      {
        key: "leadPriorityOverride",
        value: JSON.stringify({ day: tzDayKey(NOW), profile: "PAYMENT" }),
      },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r).toEqual({
      selection: { kind: "preset", id: "PAYMENT" },
      todayOnly: true,
      defaultSelection: { kind: "preset", id: "BALANCED" },
    });
  });

  it("bugungi override (yangi format, custom) doimiy profildan ustun", async () => {
    findMany.mockResolvedValue([
      { key: "leadPriorityProfile", value: "BALANCED" },
      {
        key: "leadPriorityOverride",
        value: JSON.stringify({
          day: tzDayKey(NOW),
          selection: { kind: "custom", shares: [{ segment: "NEW", share: 60 }] },
        }),
      },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.selection).toEqual({ kind: "custom", shares: [{ segment: "NEW", share: 60 }] });
    expect(r.todayOnly).toBe(true);
    expect(r.defaultSelection).toEqual({ kind: "preset", id: "BALANCED" });
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
    expect(r.selection).toEqual({ kind: "preset", id: "BALANCED" });
    expect(r.todayOnly).toBe(false);
  });

  it("buzilgan qiymatlar tizimni to'xtatmaydi", async () => {
    findMany.mockResolvedValue([
      { key: "leadPriorityProfile", value: "YO'Q_PROFIL" },
      { key: "leadPriorityOverride", value: "{buzilgan json" },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.selection).toEqual({ kind: "preset", id: "BALANCED" });
  });

  it("buzilgan custom ulush (100%dan ortiq) e'tiborsiz — standart profil qaytadi", async () => {
    findMany.mockResolvedValue([
      {
        key: "leadPriorityProfile",
        value: JSON.stringify({
          kind: "custom",
          shares: [
            { segment: "DEBTOR", share: 80 },
            { segment: "NEW", share: 40 },
          ],
        }),
      },
    ]);
    const r = await getActiveLeadProfile(NOW);
    expect(r.selection).toEqual({ kind: "preset", id: "BALANCED" });
  });
});

describe("saveLeadFocusSelection", () => {
  it("faqat bugunga — override yoziladi, doimiy tegilmaydi", async () => {
    await saveLeadFocusSelection({ kind: "preset", id: "PAYMENT" }, true, NOW);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where.key).toBe("leadPriorityOverride");
    expect(JSON.parse(upsert.mock.calls[0][0].create.value)).toEqual({
      day: tzDayKey(NOW),
      selection: { kind: "preset", id: "PAYMENT" },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("doimiy — tanlov yoziladi va eski override o'chadi", async () => {
    await saveLeadFocusSelection({ kind: "preset", id: "HIGH_VALUE" }, false, NOW);
    expect(upsert.mock.calls[0][0].where.key).toBe("leadPriorityProfile");
    expect(JSON.parse(upsert.mock.calls[0][0].create.value)).toEqual({
      kind: "preset",
      id: "HIGH_VALUE",
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { key: "leadPriorityOverride" },
    });
  });

  it("maxsus tanlov doimiy sifatida saqlanadi", async () => {
    const sel = { kind: "custom" as const, shares: [{ segment: "DEBTOR" as const, share: 70 }] };
    await saveLeadFocusSelection(sel, false, NOW);
    expect(JSON.parse(upsert.mock.calls[0][0].create.value)).toEqual(sel);
  });
});

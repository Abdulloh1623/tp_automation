import { describe, it, expect } from "vitest";
import {
  allocateByProfile,
  buildRegionCoverage,
  splitByCapacity,
  splitPoolByRegionCoverage,
  splitRoundRobin,
  weightedAutoLimit,
} from "./distribute-util";
import type { LeadSegment, ProfileShare } from "./constants";

describe("splitRoundRobin", () => {
  it("round-robin teng taqsimlaydi (sig'imdan kam)", () => {
    const { byOp, overflow } = splitRoundRobin(["a", "b", "c", "d"], ["op1", "op2"], 10);
    expect(byOp.get("op1")).toEqual(["a", "c"]);
    expect(byOp.get("op2")).toEqual(["b", "d"]);
    expect(overflow).toEqual([]);
  });

  it("har operatorga cap gacha; ortgani overflow'ga", () => {
    const { byOp, overflow } = splitRoundRobin(["a", "b", "c", "d", "e"], ["op1", "op2"], 2);
    // sig'im = 2 ops × 2 = 4
    expect(byOp.get("op1")).toEqual(["a", "c"]);
    expect(byOp.get("op2")).toEqual(["b", "d"]);
    expect(overflow).toEqual(["e"]);
  });

  it("hech bir operator cap'dan oshmaydi", () => {
    const ids = Array.from({ length: 130 }, (_, i) => `c${i}`);
    const { byOp, overflow } = splitRoundRobin(ids, ["a", "b"], 50);
    for (const list of byOp.values()) expect(list.length).toBeLessThanOrEqual(50);
    expect(byOp.get("a")!.length).toBe(50);
    expect(byOp.get("b")!.length).toBe(50);
    expect(overflow.length).toBe(30); // 130 - 100
  });

  it("bo'sh ro'yxat — hammasi bo'sh", () => {
    const { byOp, overflow } = splitRoundRobin([], ["op1"], 50);
    expect(byOp.get("op1")).toEqual([]);
    expect(overflow).toEqual([]);
  });

  it("barcha id'lar bir marta taqsimlanadi (yo'qotish yo'q)", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const { byOp, overflow } = splitRoundRobin(ids, ["op1", "op2"], 10);
    const all = [...byOp.values()].flat().concat(overflow).sort();
    expect(all).toEqual([...ids].sort());
  });
});

describe("splitByCapacity", () => {
  it("har operator o'z sig'imicha oladi (kvotasi band bo'lganiga kam beradi)", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const { byOp, overflow } = splitByCapacity(ids, [
      { id: "op1", cap: 2 },
      { id: "op2", cap: 6 },
    ]);
    expect(byOp.get("op1")!.length).toBe(2);
    expect(byOp.get("op2")!.length).toBe(6);
    expect(overflow.length).toBe(2);
  });

  it("sig'imi 0 bo'lgan operator hech narsa olmaydi", () => {
    const { byOp } = splitByCapacity(["a", "b"], [
      { id: "band", cap: 0 },
      { id: "bo'sh", cap: 5 },
    ]);
    expect(byOp.get("band")).toEqual([]);
    expect(byOp.get("bo'sh")).toEqual(["a", "b"]);
  });
});

describe("allocateByProfile", () => {
  const buckets = (o: Partial<Record<LeadSegment, string[]>>) =>
    new Map(Object.entries(o) as [LeadSegment, string[]][]);

  const order: ProfileShare[] = [
    { segment: "DEBTOR", share: 60 },
    { segment: "NEW", share: 30 },
    { segment: "OTHERS", share: 10 },
  ];

  const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);

  it("ulush bo'yicha kvota taqsimlaydi", () => {
    const { picked } = allocateByProfile(
      buckets({ DEBTOR: ids("d", 50), NEW: ids("n", 50), OTHERS: ids("o", 50) }),
      order,
      [],
      10,
    );
    expect(picked.length).toBe(10);
    expect(picked.filter((x) => x.startsWith("d")).length).toBe(6);
    expect(picked.filter((x) => x.startsWith("n")).length).toBe(3);
    expect(picked.filter((x) => x.startsWith("o")).length).toBe(1);
  });

  it("segment yetarli bo'lmasa bo'sh joy keyingi segmentga oqadi", () => {
    const { picked } = allocateByProfile(
      buckets({ DEBTOR: ids("d", 2), NEW: ids("n", 50) }),
      order,
      [],
      10,
    );
    expect(picked.length).toBe(10);
    expect(picked.filter((x) => x.startsWith("d")).length).toBe(2);
    expect(picked.filter((x) => x.startsWith("n")).length).toBe(8);
  });

  it("majburiy pol birinchi kiradi va kvotadan oldin joy oladi", () => {
    const { picked } = allocateByProfile(
      buckets({ DEBTOR: ids("d", 50), NEW: ["n0", "n1"], OTHERS: [] }),
      order,
      ["n0", "n1"],
      10,
    );
    expect(picked.slice(0, 2)).toEqual(["n0", "n1"]);
    expect(picked.length).toBe(10);
    // qolgan 8 joy ulushlarga bo'linadi, pol takrorlanmaydi
    expect(new Set(picked).size).toBe(10);
  });

  it("sig'imdan ortgani leftover'ga tushadi va hech narsa yo'qolmaydi", () => {
    const all = { DEBTOR: ids("d", 5), NEW: ids("n", 5) };
    const { picked, leftover } = allocateByProfile(buckets(all), order, [], 4);
    expect(picked.length).toBe(4);
    expect([...picked, ...leftover].sort()).toEqual([...all.DEBTOR, ...all.NEW].sort());
  });

  it("sig'im 0 — hech kim tanlanmaydi", () => {
    const { picked, leftover } = allocateByProfile(
      buckets({ DEBTOR: ids("d", 3) }),
      order,
      ["d0"],
      0,
    );
    expect(picked).toEqual([]);
    expect(leftover.length).toBe(3);
  });
});

describe("buildRegionCoverage", () => {
  it("bitta viloyatga bitta operator — bir yozuv", () => {
    const cov = buildRegionCoverage([{ id: "op1", region: null, regions: "Toshkent" }]);
    expect(cov.get("Toshkent")).toEqual(["op1"]);
  });

  it("ko'p viloyatli operator — har biriga qo'shiladi", () => {
    const cov = buildRegionCoverage([
      { id: "op1", region: null, regions: "Andijon,Farg'ona,Namangan" },
    ]);
    expect([...cov.keys()].sort()).toEqual(["Andijon", "Farg'ona", "Namangan"]);
    for (const list of cov.values()) expect(list).toEqual(["op1"]);
  });

  it("bir viloyatni bir nechta operator qoplasa — ikkalasi ham ro'yxatda", () => {
    const cov = buildRegionCoverage([
      { id: "op1", region: null, regions: "Toshkent" },
      { id: "op2", region: null, regions: "Toshkent,Andijon" },
    ]);
    expect(cov.get("Toshkent")!.sort()).toEqual(["op1", "op2"]);
    expect(cov.get("Andijon")).toEqual(["op2"]);
  });

  it("imlo variantlari kanonik nomga birlashadi (normalizeRegion)", () => {
    const cov = buildRegionCoverage([{ id: "op1", region: null, regions: "Surxandaryo" }]);
    expect(cov.has("Surxondaryo")).toBe(true);
    expect(cov.has("Surxandaryo")).toBe(false);
  });

  it("eski `region` (birlamchi) ham `regions` bilan birga qo'shiladi", () => {
    const cov = buildRegionCoverage([{ id: "op1", region: "Buxoro", regions: "Navoiy" }]);
    expect([...cov.keys()].sort()).toEqual(["Buxoro", "Navoiy"]);
  });

  it("viloyati yo'q operator — hech qayerga qo'shilmaydi", () => {
    const cov = buildRegionCoverage([{ id: "op1", region: null, regions: null }]);
    expect(cov.size).toBe(0);
  });
});

describe("splitPoolByRegionCoverage", () => {
  const coverage = buildRegionCoverage([{ id: "op1", region: null, regions: "Toshkent" }]);

  it("qoplangan viloyat mijozi o'z guruhiga tushadi", () => {
    const { byRegion, fallback } = splitPoolByRegionCoverage(
      [{ id: "c1", region: "Toshkent" }],
      coverage,
    );
    expect(byRegion.get("Toshkent")).toEqual([{ id: "c1", region: "Toshkent" }]);
    expect(fallback).toEqual([]);
  });

  it("qoplanmagan viloyat mijozi fallbackka tushadi", () => {
    const { byRegion, fallback } = splitPoolByRegionCoverage(
      [{ id: "c1", region: "Andijon" }],
      coverage,
    );
    expect(byRegion.size).toBe(0);
    expect(fallback).toEqual([{ id: "c1", region: "Andijon" }]);
  });

  it("viloyatsiz mijoz fallbackka tushadi", () => {
    const { byRegion, fallback } = splitPoolByRegionCoverage(
      [{ id: "c1", region: null }],
      coverage,
    );
    expect(byRegion.size).toBe(0);
    expect(fallback).toEqual([{ id: "c1", region: null }]);
  });

  it("imlo varianti ham to'g'ri guruhga tushadi", () => {
    const cov = buildRegionCoverage([{ id: "op1", region: null, regions: "Surxondaryo" }]);
    const { byRegion, fallback } = splitPoolByRegionCoverage(
      [{ id: "c1", region: "Surxandaryo" }],
      cov,
    );
    expect(byRegion.get("Surxondaryo")).toEqual([{ id: "c1", region: "Surxandaryo" }]);
    expect(fallback).toEqual([]);
  });

  it("aralash hovuz to'g'ri bo'linadi, hech narsa yo'qolmaydi", () => {
    const pool = [
      { id: "a", region: "Toshkent" },
      { id: "b", region: "Andijon" },
      { id: "c", region: null },
      { id: "d", region: "Toshkent" },
    ];
    const { byRegion, fallback } = splitPoolByRegionCoverage(pool, coverage);
    expect(byRegion.get("Toshkent")!.map((c) => c.id)).toEqual(["a", "d"]);
    expect(fallback.map((c) => c.id)).toEqual(["b", "c"]);
  });
});

describe("weightedAutoLimit", () => {
  const policy = { minPerOperator: 10, maxPerOperator: 50 };

  it("faqat kunduzgi operatorlar — teng bo'linadi", () => {
    const { dayAuto, nightAuto } = weightedAutoLimit(100, 4, 0, 40, policy);
    expect(dayAuto).toBe(25);
    expect(nightAuto).toBe(15); // 25 * 0.6
  });

  it("kechki chegirma kunduzgidan kamroq beradi", () => {
    const { dayAuto, nightAuto } = weightedAutoLimit(60, 2, 1, 50, policy);
    // weighted = 2 + 1*0.5 = 2.5 -> ceil(60/2.5)=24
    expect(dayAuto).toBe(24);
    expect(nightAuto).toBe(12);
  });

  it("chegaralar hurmat qilinadi (min/max)", () => {
    const tiny = weightedAutoLimit(1, 10, 0, 0, policy);
    expect(tiny.dayAuto).toBe(policy.minPerOperator);
    const huge = weightedAutoLimit(10000, 1, 0, 0, policy);
    expect(huge.dayAuto).toBe(policy.maxPerOperator);
  });

  it("operator yo'q bo'lsa — 0", () => {
    const { dayAuto, nightAuto } = weightedAutoLimit(50, 0, 0, 40, policy);
    expect(dayAuto).toBe(0);
    expect(nightAuto).toBe(0);
  });

  it("chegirma 0% — kechki kunduzgiga teng", () => {
    const { dayAuto, nightAuto } = weightedAutoLimit(40, 2, 2, 0, policy);
    expect(dayAuto).toBe(nightAuto);
  });
});

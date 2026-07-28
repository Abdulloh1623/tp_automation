import { describe, it, expect } from "vitest";
import { allocateByProfile, splitByCapacity, splitRoundRobin } from "./distribute-util";
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

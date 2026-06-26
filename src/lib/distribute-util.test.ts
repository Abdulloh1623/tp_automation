import { describe, it, expect } from "vitest";
import { splitRoundRobin } from "./distribute-util";

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

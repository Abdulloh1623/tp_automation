import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("chegaragacha ruxsat beradi, keyin to'sadi", () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 10)).toBe(true);
    expect(rl.allow("a", 20)).toBe(true);
    expect(rl.allow("a", 30)).toBe(false);
  });

  it("kalitlar bir-biridan mustaqil", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 1)).toBe(false);
    expect(rl.allow("b", 1)).toBe(true);
  });

  it("oyna o'tgach qayta ochiladi", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 100)).toBe(true);
    expect(rl.allow("a", 200)).toBe(false);
    expect(rl.allow("a", 1500)).toBe(true); // yangi oyna
  });

  it("count joriy oynadagi urinishlarni beradi", () => {
    const rl = new RateLimiter(5, 1000);
    rl.allow("a", 0);
    rl.allow("a", 10);
    expect(rl.count("a", 20)).toBe(2);
    expect(rl.count("a", 2000)).toBe(0); // oyna o'tdi
    expect(rl.count("yoq", 0)).toBe(0);
  });

  it("reset tozalaydi", () => {
    const rl = new RateLimiter(1, 1000);
    rl.allow("a", 0);
    expect(rl.allow("a", 1)).toBe(false);
    rl.reset("a");
    expect(rl.allow("a", 2)).toBe(true);
    rl.reset();
    expect(rl.count("a", 3)).toBe(0);
  });

  it("kalitlar soni chegaradan oshmaydi (xotira himoyasi)", () => {
    const rl = new RateLimiter(1, 1000, 10);
    for (let i = 0; i < 100; i++) rl.allow(`k${i}`, i);
    // Ichki map maxKeys atrofida ushlab turiladi — eng eskilari chiqariladi.
    // Buni bilvosita tekshiramiz: eng eski kalit endi yangi hisoblanadi.
    expect(rl.allow("k0", 200)).toBe(true);
  });
});

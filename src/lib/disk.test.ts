import { describe, it, expect } from "vitest";
import { getDiskUsage, isDiskLow, diskWarning, type DiskUsage } from "./disk";

const usage = (freeGb: number, totalGb: number, usedPct: number): DiskUsage => ({
  freeGb,
  totalGb,
  usedPct,
});

describe("isDiskLow", () => {
  it("bo'sh joy yetarli — xavf yo'q", () => {
    expect(isDiskLow(usage(12, 20, 40))).toBe(false);
  });

  it("bo'sh joy chegaradan kam — xavf", () => {
    expect(isDiskLow(usage(2.4, 20, 80))).toBe(true);
  });

  it("bandlik foizi yuqori — katta diskda ham xavf", () => {
    expect(isDiskLow(usage(20, 200, 90))).toBe(true);
  });

  it("chegaralarni o'zgartirsa bo'ladi", () => {
    expect(isDiskLow(usage(4, 20, 80), 5, 95)).toBe(true);
    expect(isDiskLow(usage(4, 20, 80), 3, 95)).toBe(false);
  });
});

describe("diskWarning", () => {
  it("bo'sh joy, hajm va foizni ko'rsatadi", () => {
    const msg = diskWarning(usage(1.2, 20, 94));
    expect(msg).toContain("1.2 GB");
    expect(msg).toContain("20 GB");
    expect(msg).toContain("94%");
  });
});

describe("getDiskUsage", () => {
  it("haqiqiy fayl tizimi uchun mantiqiy qiymat qaytaradi", async () => {
    const u = await getDiskUsage(process.cwd());
    expect(u).not.toBeNull();
    expect(u!.totalGb).toBeGreaterThan(0);
    expect(u!.freeGb).toBeGreaterThanOrEqual(0);
    expect(u!.usedPct).toBeGreaterThanOrEqual(0);
    expect(u!.usedPct).toBeLessThanOrEqual(100);
  });

  it("mavjud bo'lmagan yo'lda yiqilmaydi", async () => {
    expect(await getDiskUsage("/bunday-yol-yoq-12345")).toBeNull();
  });
});

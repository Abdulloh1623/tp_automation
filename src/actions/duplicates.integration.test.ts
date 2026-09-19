// "Dublikat emas" belgilash/bekor qilish — HAQIQIY bazaga qarshi (asosan
// @@unique tartibga bog'liq bo'lmasligi va onDelete: Cascade to'g'ri
// ishlashini tekshirish uchun — buni sof unit test tekshira olmaydi).

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { dismissDuplicatePair, undoDismissDuplicate } from "./duplicates";
import { resetDb, makeUser, makeClient, loginAs } from "@/test/fixtures";

describe("dismissDuplicatePair", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("OPERATOR qila olmaydi", async () => {
    await loginAs(await makeUser("OPERATOR"));
    const a = await makeClient();
    const b = await makeClient();

    const res = await dismissDuplicatePair(a.id, b.id);

    expect(res.ok).toBe(false);
    expect(await db.duplicateDismissal.count()).toBe(0);
  });

  it("ADMIN/SUPER_ADMIN/HEAD_OF_SUPPORT belgilay oladi — tartib qanday bo'lishidan qat'i nazar bitta qator yoziladi", async () => {
    for (const role of ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT"] as const) {
      await resetDb();
      await loginAs(await makeUser(role));
      const a = await makeClient();
      const b = await makeClient();

      // Teskari tartibda yuboriladi (b, a) — baribir bitta qator, kichikroq
      // id birinchi ustunga tushishi kerak (pairKey bilan bir xil mantiq).
      const res = await dismissDuplicatePair(b.id, a.id);

      expect(res.ok, `rol ${role}`).toBe(true);
      const rows = await db.duplicateDismissal.findMany();
      expect(rows, `rol ${role}`).toHaveLength(1);
      const [smaller, larger] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      expect(rows[0].clientAId, `rol ${role}`).toBe(smaller);
      expect(rows[0].clientBId, `rol ${role}`).toBe(larger);
    }
  });

  it("ikki marta belgilash xato bermaydi (idempotent)", async () => {
    await loginAs(await makeUser("ADMIN"));
    const a = await makeClient();
    const b = await makeClient();

    const first = await dismissDuplicatePair(a.id, b.id);
    const second = await dismissDuplicatePair(a.id, b.id);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(await db.duplicateDismissal.count()).toBe(1);
  });

  it("mijozlardan biri o'chirilsa — yozuv ham kaskad o'chadi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const a = await makeClient();
    const b = await makeClient();
    await dismissDuplicatePair(a.id, b.id);
    expect(await db.duplicateDismissal.count()).toBe(1);

    await db.client.delete({ where: { id: a.id } });

    expect(await db.duplicateDismissal.count()).toBe(0);
  });
});

describe("undoDismissDuplicate", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("OPERATOR qila olmaydi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const a = await makeClient();
    const b = await makeClient();
    await dismissDuplicatePair(a.id, b.id);
    const row = await db.duplicateDismissal.findFirstOrThrow();

    await loginAs(await makeUser("OPERATOR"));
    const res = await undoDismissDuplicate(row.id);

    expect(res.ok).toBe(false);
    expect(await db.duplicateDismissal.count()).toBe(1);
  });

  it("bekor qiladi — yozuv o'chadi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const a = await makeClient();
    const b = await makeClient();
    await dismissDuplicatePair(a.id, b.id);
    const row = await db.duplicateDismissal.findFirstOrThrow();

    const res = await undoDismissDuplicate(row.id);

    expect(res.ok).toBe(true);
    expect(await db.duplicateDismissal.count()).toBe(0);
  });
});

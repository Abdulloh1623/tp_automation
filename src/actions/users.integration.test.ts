// Xodim yaratish — haqiqiy bazaga qarshi integratsion testlar.
//
// Bu yerda tekshiriladigan narsa: formadagi maydon BAZAGA YETIB BORISHI.
// `createUser` sxemasi `telegramId` va `cardVerifier` ni parse qilardi, lekin
// ularni `db.user.create` ga uzatmasdi — maydon jimgina tushib qolardi. Bu
// oddiy noqulaylik emas: `cardVerifier` yozilmasa karta/QR to'lovlari
// tasdiqsiz o'tib ketaveradi (tizim ataylab fail-open), ya'ni pul nazorati
// o'chib qoladi va buni hech kim sezmaydi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createUser } from "./users";
import { resetDb, makeUser, loginAs } from "@/test/fixtures";

describe("createUser", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("karta tasdiqlovchisini BIR QADAMDA yaratadi (telegramId + cardVerifier)", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);

    const res = await createUser({
      name: "Tasdiqlovchi Xodim",
      username: "tasdiqlovchi",
      password: "parol12345",
      role: "MANAGER",
      telegramId: "123456789",
      cardVerifier: true,
    });
    expect(res.ok).toBe(true);

    const created = await db.user.findUnique({ where: { username: "tasdiqlovchi" } });
    expect(created?.telegramId).toBe("123456789");
    expect(created?.cardVerifier).toBe(true);
  });

  it("belgilanmasa cardVerifier false, telegramId null bo'ladi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);

    const res = await createUser({
      name: "Oddiy Xodim",
      username: "oddiy",
      password: "parol12345",
      role: "OPERATOR",
    });
    expect(res.ok).toBe(true);

    const created = await db.user.findUnique({ where: { username: "oddiy" } });
    expect(created?.cardVerifier).toBe(false);
    expect(created?.telegramId).toBeNull();
  });

  it("bo'sh Telegram ID null sifatida yoziladi (bo'sh satr EMAS)", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);

    await createUser({
      name: "Bo'sh TG",
      username: "boshtg",
      password: "parol12345",
      role: "OPERATOR",
      telegramId: "   ",
    });

    // Bot tasdiqlovchilarni `telegramId: { not: null }` bo'yicha qidiradi —
    // bo'sh satr yozilsa u "TG bor" deb hisoblanib, xabar hech kimga bormasdi.
    const created = await db.user.findUnique({ where: { username: "boshtg" } });
    expect(created?.telegramId).toBeNull();
  });
});

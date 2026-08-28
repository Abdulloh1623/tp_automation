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
import { createUser, updateUser } from "./users";
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

describe("updateUser — login (username) o'zgartirish", () => {
  beforeEach(async () => {
    await resetDb();
  });

  function form(over: Partial<Record<string, string>> = {}) {
    return {
      name: "Test Xodim",
      role: "OPERATOR",
      shift: "DAY",
      ...over,
    };
  }

  it("bosh admin xodimning loginini o'zgartira oladi", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("OPERATOR", { username: "eski-login" });
    await loginAs(admin);

    const res = await updateUser(staff.id, form({ username: "yangi-login" }));

    expect(res.ok).toBe(true);
    const after = await db.user.findUnique({ where: { id: staff.id } });
    expect(after?.username).toBe("yangi-login");
  });

  it("band loginga o'zgartira olmaydi", async () => {
    const admin = await makeUser("ADMIN");
    await makeUser("OPERATOR", { username: "band-login" });
    const staff = await makeUser("OPERATOR", { username: "eski-login" });
    await loginAs(admin);

    const res = await updateUser(staff.id, form({ username: "band-login" }));

    expect(res.ok).toBe(false);
    const after = await db.user.findUnique({ where: { id: staff.id } });
    expect(after?.username).toBe("eski-login");
  });

  it("login berilmasa (o'zgarmasa) eskisi saqlanadi", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("OPERATOR", { username: "eski-login" });
    await loginAs(admin);

    const res = await updateUser(staff.id, form({ username: "eski-login" }));

    expect(res.ok).toBe(true);
    const after = await db.user.findUnique({ where: { id: staff.id } });
    expect(after?.username).toBe("eski-login");
  });

  it("MANAGER/OPERATOR loginni o'zgartira OLMAYDI (faqat ADMIN)", async () => {
    const manager = await makeUser("MANAGER");
    const staff = await makeUser("OPERATOR", { username: "eski-login" });
    await loginAs(manager);

    const res = await updateUser(staff.id, form({ username: "yangi-login" }));

    expect(res.ok).toBe(false);
    const after = await db.user.findUnique({ where: { id: staff.id } });
    expect(after?.username).toBe("eski-login");
  });
});

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
      role: "HEAD_OF_SUPPORT",
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

  it("OPERATOR boshqa xodimning loginini o'zgartira OLMAYDI (faqat ADMIN/SUPER_ADMIN/HEAD_OF_SUPPORT)", async () => {
    const other = await makeUser("OPERATOR");
    const staff = await makeUser("OPERATOR", { username: "eski-login" });
    await loginAs(other);

    const res = await updateUser(staff.id, form({ username: "yangi-login" }));

    expect(res.ok).toBe(false);
    const after = await db.user.findUnique({ where: { id: staff.id } });
    expect(after?.username).toBe("eski-login");
  });

  it("SUPER_ADMIN xodimning loginini o'zgartira OLADI (ADMIN bilan bir xil)", async () => {
    const superAdmin = await makeUser("SUPER_ADMIN");
    const staff = await makeUser("OPERATOR", { username: "eski-login" });
    await loginAs(superAdmin);

    const res = await updateUser(staff.id, form({ username: "yangi-login" }));

    expect(res.ok).toBe(true);
    const after = await db.user.findUnique({ where: { id: staff.id } });
    expect(after?.username).toBe("yangi-login");
  });

  it("ADMIN boshqa ADMIN/SUPER_ADMIN hisobini tahrirlay OLMAYDI (imtiyoz chegarasi)", async () => {
    const admin = await makeUser("ADMIN");
    const superAdmin = await makeUser("SUPER_ADMIN", { username: "boss" });
    await loginAs(admin);

    const res = await updateUser(superAdmin.id, form({ username: "boss2" }));

    expect(res.ok).toBe(false);
    const after = await db.user.findUnique({ where: { id: superAdmin.id } });
    expect(after?.username).toBe("boss");
  });

  it("HEAD_OF_SUPPORT faqat OPERATOR hisobini tahrirlaydi, boshqa rolga tegmaydi", async () => {
    const head = await makeUser("HEAD_OF_SUPPORT");
    const admin = await makeUser("ADMIN", { username: "admin-hisob" });
    await loginAs(head);

    const res = await updateUser(admin.id, form({ username: "admin-hisob2" }));

    expect(res.ok).toBe(false);
    const after = await db.user.findUnique({ where: { id: admin.id } });
    expect(after?.username).toBe("admin-hisob");
  });
});

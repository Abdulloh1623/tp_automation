// updateUstaStatus — usta (veb login) endi FAQAT o'ziga biriktirilgan
// vazifasini yangilay oladi — HAQIQIY bazaga qarshi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  updateUstaStatus,
  updateMyProfile,
  changeMyPassword,
  blockUstaTask,
  unblockUstaTask,
} from "./usta";
import { resetDb, makeUser, makeClient, loginAs } from "@/test/fixtures";

describe("updateUstaStatus — usta o'zi (veb login)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("o'ziga biriktirilgan vazifani yangilay oladi", async () => {
    const usta = await makeUser("INSTALLER");
    const client = await makeClient();
    await db.client.update({
      where: { id: client.id },
      data: { assignedUstaId: usta.id, stage: "FORWARDED", ustaStatus: "ASSIGNED" },
    });
    await loginAs(usta);

    const res = await updateUstaStatus(client.id, "ARRIVED");

    expect(res.ok).toBe(true);
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.ustaStatus).toBe("ARRIVED");
  });

  it("boshqa ustaga biriktirilgan vazifani yangilay OLMAYDI", async () => {
    const usta = await makeUser("INSTALLER");
    const boshqaUsta = await makeUser("INSTALLER");
    const client = await makeClient();
    await db.client.update({
      where: { id: client.id },
      data: { assignedUstaId: usta.id, stage: "FORWARDED", ustaStatus: "ASSIGNED" },
    });
    await loginAs(boshqaUsta);

    const res = await updateUstaStatus(client.id, "ARRIVED");

    expect(res.ok).toBe(false);
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.ustaStatus).toBe("ASSIGNED");
  });

  it("\"Bajarildi\" izohsiz qila OLMAYDI", async () => {
    const usta = await makeUser("INSTALLER");
    const client = await makeClient();
    await db.client.update({
      where: { id: client.id },
      data: { assignedUstaId: usta.id, stage: "FORWARDED", ustaStatus: "ARRIVED" },
    });
    await loginAs(usta);

    const res = await updateUstaStatus(client.id, "DONE");

    expect(res.ok).toBe(false);
  });
});

describe("updateMyProfile — usta o'z ma'lumotlarini o'zi yangilaydi", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ism, manzil, viloyatlar va telefonni yangilay oladi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);

    const res = await updateMyProfile({
      name: "Yangi Ism",
      address: "Toshkent, Chilonzor",
      regions: ["Toshkent", "Andijon"],
      phone: "+998901234567",
    });

    expect(res.ok).toBe(true);
    const after = await db.user.findUnique({ where: { id: usta.id } });
    expect(after!.name).toBe("Yangi Ism");
    expect(after!.address).toBe("Toshkent, Chilonzor");
    expect(after!.region).toBe("Toshkent");
    expect(after!.regions).toBe("Toshkent,Andijon");
    expect(after!.phone).toBe("+998901234567");
  });

  it("bo'sh ism qabul qilinmaydi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);

    const res = await updateMyProfile({ name: "   " });

    expect(res.ok).toBe(false);
  });

  it("usta bo'lmagan rol bu amalni bajara OLMAYDI", async () => {
    const operator = await makeUser("OPERATOR");
    await loginAs(operator);

    const res = await updateMyProfile({ name: "Boshqa Ism", phone: "+998901234567" });

    expect(res.ok).toBe(false);
    const after = await db.user.findUnique({ where: { id: operator.id } });
    expect(after!.phone).toBeNull();
  });
});

describe("changeMyPassword — usta o'z parolini o'zi almashtiradi", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("o'z parolini almashtira oladi va sessiyasi bekor bo'ladi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);

    const res = await changeMyPassword({
      newPassword: "yangiParol1",
      confirm: "yangiParol1",
    });

    expect(res.ok).toBe(true);
    const after = await db.user.findUnique({ where: { id: usta.id } });
    expect(after!.sessionVersion).toBe(usta.sessionVersion + 1);
    expect(after!.passwordHash).not.toBe(usta.passwordHash);
  });

  it("parollar mos kelmasa rad etiladi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);

    const res = await changeMyPassword({
      newPassword: "yangiParol1",
      confirm: "boshqaParol1",
    });

    expect(res.ok).toBe(false);
    const after = await db.user.findUnique({ where: { id: usta.id } });
    expect(after!.sessionVersion).toBe(usta.sessionVersion);
  });

  it("juda qisqa parol rad etiladi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);

    const res = await changeMyPassword({ newPassword: "qisqa", confirm: "qisqa" });

    expect(res.ok).toBe(false);
  });

  it("usta bo'lmagan rol bu amalni bajara OLMAYDI", async () => {
    const operator = await makeUser("OPERATOR");
    await loginAs(operator);

    const res = await changeMyPassword({
      newPassword: "yangiParol1",
      confirm: "yangiParol1",
    });

    expect(res.ok).toBe(false);
  });
});

describe("blockUstaTask / unblockUstaTask — kanban 'Hal bo'lmadi' bo'limi", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("usta o'ziga biriktirilgan vazifani izoh bilan 'Hal bo'lmadi'ga belgilaydi", async () => {
    const usta = await makeUser("INSTALLER");
    const client = await makeClient();
    await db.client.update({
      where: { id: client.id },
      data: { assignedUstaId: usta.id, stage: "FORWARDED", ustaStatus: "ARRIVED" },
    });
    await loginAs(usta);

    const res = await blockUstaTask(client.id, "Mijoz telefon ko'targani yo'q");

    expect(res.ok).toBe(true);
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.ustaBlocked).toBe(true);
    expect(after!.ustaBlockedNote).toBe("Mijoz telefon ko'targani yo'q");
    // Bosqich (ARRIVED) yo'qolmaydi — bayroq mustaqil.
    expect(after!.ustaStatus).toBe("ARRIVED");
  });

  it("izohsiz belgilab bo'lmaydi", async () => {
    const usta = await makeUser("INSTALLER");
    const client = await makeClient();
    await db.client.update({
      where: { id: client.id },
      data: { assignedUstaId: usta.id, stage: "FORWARDED", ustaStatus: "ARRIVED" },
    });
    await loginAs(usta);

    const res = await blockUstaTask(client.id, "   ");

    expect(res.ok).toBe(false);
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.ustaBlocked).toBe(false);
  });

  it("boshqa ustaga biriktirilgan vazifani belgilay OLMAYDI", async () => {
    const usta = await makeUser("INSTALLER");
    const boshqaUsta = await makeUser("INSTALLER");
    const client = await makeClient();
    await db.client.update({
      where: { id: client.id },
      data: { assignedUstaId: usta.id, stage: "FORWARDED", ustaStatus: "ARRIVED" },
    });
    await loginAs(boshqaUsta);

    const res = await blockUstaTask(client.id, "Sinov izohi");

    expect(res.ok).toBe(false);
  });

  it("'Qayta urinish' bosqichni saqlagan holda bayroqni tozalaydi", async () => {
    const usta = await makeUser("INSTALLER");
    const client = await makeClient();
    await db.client.update({
      where: { id: client.id },
      data: {
        assignedUstaId: usta.id,
        stage: "FORWARDED",
        ustaStatus: "ARRIVED",
        ustaBlocked: true,
        ustaBlockedNote: "Eski izoh",
      },
    });
    await loginAs(usta);

    const res = await unblockUstaTask(client.id);

    expect(res.ok).toBe(true);
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.ustaBlocked).toBe(false);
    expect(after!.ustaBlockedNote).toBeNull();
    expect(after!.ustaStatus).toBe("ARRIVED");
  });
});

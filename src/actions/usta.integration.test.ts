// updateUstaStatus — usta (veb login) endi FAQAT o'ziga biriktirilgan
// vazifasini yangilay oladi — HAQIQIY bazaga qarshi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { updateUstaStatus, updateMyPhone, changeMyPassword } from "./usta";
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

describe("updateMyPhone — usta o'z telefonini o'zi yangilaydi", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("o'z telefonini yangilay oladi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);

    const res = await updateMyPhone("+998901234567");

    expect(res.ok).toBe(true);
    const after = await db.user.findUnique({ where: { id: usta.id } });
    expect(after!.phone).toBe("+998901234567");
  });

  it("bo'sh telefon qabul qilinmaydi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);

    const res = await updateMyPhone("   ");

    expect(res.ok).toBe(false);
  });

  it("usta bo'lmagan rol bu amalni bajara OLMAYDI", async () => {
    const operator = await makeUser("OPERATOR");
    await loginAs(operator);

    const res = await updateMyPhone("+998901234567");

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

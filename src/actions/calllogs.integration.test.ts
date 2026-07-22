// Izoh (qo'ng'iroq yozuvi) tahrirlash/o'chirish — haqiqiy bazaga qarshi.
//
// Diqqat markazida: RUXSAT qatlami (admin har qanday izohni; egasi faqat o'zinikini)
// va O'CHIRISH VAQT OYNASI (egasi uchun 5 soat, admin cheklovsiz) — pul/audit bilan
// bog'liq nozik mantiq, unit testda qoplanmagan.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { editCallLog, deleteCallLog } from "./calllogs";
import { resetDb, makeUser, makeClient, loginAs, logout, formData } from "@/test/fixtures";

const notifsFor = (userId: string) => db.notificationRecipient.count({ where: { userId } });

/** Berilgan vaqtda yozilgan izoh (qo'ng'iroq yozuvi) yaratadi. */
async function makeLog(
  clientId: string,
  operatorId: string | null,
  over: Partial<{ result: string; note: string; hoursAgo: number }> = {},
) {
  const calledAt = new Date(Date.now() - (over.hoursAgo ?? 0) * 60 * 60 * 1000);
  return db.callLog.create({
    data: {
      clientId,
      result: over.result ?? "NO_ANSWER",
      note: over.note ?? "boshlang'ich izoh",
      operatorId,
      calledAt,
    },
  });
}

describe("editCallLog", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("admin operatorning izohini tahrirlaydi — natija ham o'zgaradi, editedBy yoziladi", async () => {
    const op = await makeUser("OPERATOR");
    const admin = await makeUser("ADMIN");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id, { result: "NO_ANSWER", note: "ko'tarmadi" });

    await loginAs(admin);
    const res = await editCallLog(
      log.id,
      formData({ result: "TALKED", note: "aslida gaplashildi" }),
    );

    expect(res.ok).toBe(true);
    const after = await db.callLog.findUnique({ where: { id: log.id } });
    expect(after!.result).toBe("TALKED");
    expect(after!.note).toBe("aslida gaplashildi");
    expect(after!.editedById).toBe(admin.id);
    expect(after!.editedAt).not.toBeNull();
    // Birinchi yozgan operator o'zgarmaydi (kim yozgani saqlanadi)
    expect(after!.operatorId).toBe(op.id);
  });

  it("egasi (operator) o'z ESKI izohini vaqt cheklovisiz tahrirlaydi", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id, { hoursAgo: 48 }); // 2 kun oldin

    await loginAs(op);
    const res = await editCallLog(log.id, formData({ result: "TALKED", note: "yangilandi" }));

    expect(res.ok).toBe(true);
    const after = await db.callLog.findUnique({ where: { id: log.id } });
    expect(after!.note).toBe("yangilandi");
    expect(after!.editedById).toBe(op.id);
  });

  it("boshqa operator birovning izohini tahrirlay OLMAYDI", async () => {
    const owner = await makeUser("OPERATOR");
    const other = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, owner.id, { note: "asl" });

    await loginAs(other);
    const res = await editCallLog(log.id, formData({ result: "TALKED", note: "buzildi" }));

    expect(res.ok).toBe(false);
    const after = await db.callLog.findUnique({ where: { id: log.id } });
    expect(after!.note).toBe("asl");
    expect(after!.editedById).toBeNull();
  });

  it("audit jurnaliga eski → yangi bilan yoziladi", async () => {
    const admin = await makeUser("ADMIN");
    const client = await makeClient({ restaurantName: "Test Kafe" });
    const log = await makeLog(client.id, admin.id, { result: "NO_ANSWER", note: "eski" });

    await loginAs(admin);
    await editCallLog(log.id, formData({ result: "TALKED", note: "yangi" }));

    const audit = await db.auditLog.findFirst({ where: { action: "Izoh tahrirlandi" } });
    expect(audit).not.toBeNull();
    expect(audit!.detail).toContain("Test Kafe");
    expect(audit!.detail).toContain("eski");
    expect(audit!.detail).toContain("yangi");
  });
});

describe("deleteCallLog", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("egasi o'z izohini 5 soat ICHIDA o'chiradi", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id, { hoursAgo: 4 }); // oyna ichida

    await loginAs(op);
    const res = await deleteCallLog(log.id);

    expect(res.ok).toBe(true);
    expect(await db.callLog.findUnique({ where: { id: log.id } })).toBeNull();
  });

  it("egasi 5 soatdan KEYIN o'chira olmaydi (faqat tahrir)", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id, { hoursAgo: 6 }); // oyna o'tgan

    await loginAs(op);
    const res = await deleteCallLog(log.id);

    expect(res.ok).toBe(false);
    expect(await db.callLog.findUnique({ where: { id: log.id } })).not.toBeNull();
  });

  it("admin eski izohni (10 soat) istalgan vaqtda o'chiradi + audit", async () => {
    const op = await makeUser("OPERATOR");
    const admin = await makeUser("ADMIN");
    const client = await makeClient({ restaurantName: "Kafe X" });
    const log = await makeLog(client.id, op.id, { hoursAgo: 10, note: "o'chiriladi" });

    await loginAs(admin);
    const res = await deleteCallLog(log.id);

    expect(res.ok).toBe(true);
    expect(await db.callLog.findUnique({ where: { id: log.id } })).toBeNull();
    const audit = await db.auditLog.findFirst({ where: { action: "Izoh o'chirildi" } });
    expect(audit!.detail).toContain("Kafe X");
    expect(audit!.detail).toContain("o'chiriladi"); // o'chirilgan matn logda saqlanadi
  });

  it("boshqa operator birovning izohini o'chira OLMAYDI", async () => {
    const owner = await makeUser("OPERATOR");
    const other = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, owner.id, { hoursAgo: 1 }); // oyna ichida bo'lsa ham

    await loginAs(other);
    const res = await deleteCallLog(log.id);

    expect(res.ok).toBe(false);
    expect(await db.callLog.findUnique({ where: { id: log.id } })).not.toBeNull();
  });

  it("sessiyasiz — o'chirilmaydi", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id, { hoursAgo: 1 });
    logout();

    const res = await deleteCallLog(log.id);

    expect(res.ok).toBe(false);
    expect(await db.callLog.findUnique({ where: { id: log.id } })).not.toBeNull();
  });
});

describe("editCallLog — mijoz holatini qayta hisoblash (eskalatsiya)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("eng so'nggi yozuv NO_ANSWER→TALKED bo'lsa missedCallCount qayta hisoblanadi", async () => {
    const admin = await makeUser("ADMIN");
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    // 3 kun ketma-ket ko'tarmagan — eskalatsiya hisobida 3
    await makeLog(client.id, op.id, { result: "NO_ANSWER", hoursAgo: 48 });
    await makeLog(client.id, op.id, { result: "NO_ANSWER", hoursAgo: 24 });
    const latest = await makeLog(client.id, op.id, { result: "NO_ANSWER", hoursAgo: 0 });
    await db.client.update({ where: { id: client.id }, data: { missedCallCount: 3 } });

    await loginAs(admin);
    await editCallLog(latest.id, formData({ result: "TALKED", note: "aslida gaplashildi" }));

    const after = await db.client.findUnique({ where: { id: client.id } });
    // Eng so'nggi kun endi TALKED — ketma-ketlik uziladi
    expect(after!.missedCallCount).toBe(0);
    expect(after!.lastOutcome).toBe("TALKED");
  });

  it("eng so'nggi BO'LMAGAN yozuv tahrirlansa holat o'zgarmaydi", async () => {
    const admin = await makeUser("ADMIN");
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const older = await makeLog(client.id, op.id, { result: "NO_ANSWER", hoursAgo: 24 });
    await makeLog(client.id, op.id, { result: "NO_ANSWER", hoursAgo: 0 });
    await db.client.update({ where: { id: client.id }, data: { missedCallCount: 2 } });

    await loginAs(admin);
    await editCallLog(older.id, formData({ result: "TALKED", note: "eski yozuv tuzatildi" }));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.missedCallCount).toBe(2); // o'zgarmaydi — eng so'nggi emas
  });
});

describe("izoh tahriri/o'chirilishi — asl muallifga xabar", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("admin operator izohini tahrirlasa — operatorga bildirishnoma", async () => {
    const admin = await makeUser("ADMIN");
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id);

    await loginAs(admin);
    await editCallLog(log.id, formData({ result: "TALKED", note: "tuzatildi" }));

    expect(await notifsFor(op.id)).toBe(1);
  });

  it("operator O'Z izohini tahrirlasa — o'ziga xabar yubormaydi", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id);

    await loginAs(op);
    await editCallLog(log.id, formData({ result: "TALKED", note: "o'zim tuzatdim" }));

    expect(await notifsFor(op.id)).toBe(0);
  });

  it("admin operator izohini o'chirsa — operatorga bildirishnoma", async () => {
    const admin = await makeUser("ADMIN");
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const log = await makeLog(client.id, op.id, { hoursAgo: 1 });

    await loginAs(admin);
    await deleteCallLog(log.id);

    expect(await notifsFor(op.id)).toBe(1);
  });
});

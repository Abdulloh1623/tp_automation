// Izoh (qo'ng'iroq yozuvi) tahrirlash/o'chirish — haqiqiy bazaga qarshi.
//
// Diqqat markazida: RUXSAT qatlami (admin har qanday izohni; egasi faqat o'zinikini)
// va O'CHIRISH VAQT OYNASI (egasi uchun 5 soat, admin cheklovsiz) — pul/audit bilan
// bog'liq nozik mantiq, unit testda qoplanmagan.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { editCallLog, deleteCallLog } from "./calllogs";
import { resetDb, makeUser, makeClient, loginAs, logout, formData } from "@/test/fixtures";

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

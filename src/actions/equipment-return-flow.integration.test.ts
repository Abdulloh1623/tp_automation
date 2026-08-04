// Qaytarish oqimi — HAQIQIY bazaga qarshi.
//
// 1) Uskuna qaytarib olinganda mijoz Otkazga (REFUSED/INACTIVE) o'tishi kerak.
// 2) Yangi/Biriktirildi/Jarayonda bosqichlarida "Orqaga qaytarish" ishlaydi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { confirmReturnCollected, revertReturnRequest } from "./equipment";
import { resetDb, makeUser, makeClient, makeEquipment, loginAs, stockOf } from "@/test/fixtures";

async function makeReturnRequest(status = "APPROVED") {
  const usta = await makeUser("INSTALLER");
  const client = await makeClient();
  const type = await makeEquipment("Printer");
  await db.clientEquipment.create({
    data: { clientId: client.id, equipmentTypeId: type.id, quantity: 2, ownership: "RENTAL" },
  });
  const req = await db.equipmentReturnRequest.create({
    data: {
      clientId: client.id,
      note: "Mijoz ijaradan voz kechdi",
      status,
      ustaId: status === "PENDING" ? null : usta.id,
    },
  });
  return { req, client, usta, type };
}

describe("confirmReturnCollected — mijoz otkazga o'tadi", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("uskuna olib kelingach stage=REFUSED, status=INACTIVE bo'ladi", async () => {
    const { req, client, type, usta } = await makeReturnRequest();
    await loginAs(await makeUser("MANAGER"));

    const res = await confirmReturnCollected(req.id, "printer shikastlangan");

    expect(res.ok).toBe(true);
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.stage).toBe("REFUSED");
    expect(after!.status).toBe("INACTIVE");
    expect(after!.assignedToId).toBeNull();
    expect(await stockOf(type.id, "USTA", usta.id)).toBe(2);
  });

  it("izohsiz yakunlab bo'lmaydi — izoh majburiy", async () => {
    const { req } = await makeReturnRequest();
    await loginAs(await makeUser("MANAGER"));

    const res = await confirmReturnCollected(req.id, "");

    expect(res.ok).toBe(false);
    const reqAfter = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(reqAfter!.status).toBe("APPROVED");
  });

  it("mijoz allaqachon otkaz bo'lsa xato bermay yakunlanadi", async () => {
    const { req, client } = await makeReturnRequest();
    await db.client.update({
      where: { id: client.id },
      data: { stage: "REFUSED", status: "INACTIVE" },
    });
    await loginAs(await makeUser("MANAGER"));

    const res = await confirmReturnCollected(req.id, "uskuna qaytarildi");

    expect(res.ok).toBe(true);
    const reqAfter = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(reqAfter!.status).toBe("DONE");
  });
});

describe("revertReturnRequest — bosqichlarni orqaga qaytarish", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("IN_PROGRESS -> APPROVED, OPERATOR ham qila oladi", async () => {
    const { req, client } = await makeReturnRequest("IN_PROGRESS");
    await loginAs(await makeUser("OPERATOR"));

    const res = await revertReturnRequest(req.id);

    expect(res.ok).toBe(true);
    const after = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe("APPROVED");
    const c = await db.client.findUnique({ where: { id: client.id } });
    expect(c!.ustaStatus).toBe("ASSIGNED");
  });

  it("APPROVED -> PENDING, faqat boshliq (OPERATOR rad etiladi)", async () => {
    const { req } = await makeReturnRequest("APPROVED");
    await loginAs(await makeUser("OPERATOR"));

    const res = await revertReturnRequest(req.id);

    expect(res.ok).toBe(false);
    const after = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe("APPROVED");
  });

  it("APPROVED -> PENDING, MANAGER usta biriktiruvini yechadi", async () => {
    const { req, client } = await makeReturnRequest("APPROVED");
    await loginAs(await makeUser("MANAGER"));

    const res = await revertReturnRequest(req.id);

    expect(res.ok).toBe(true);
    const after = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe("PENDING");
    expect(after!.ustaId).toBeNull();
    const c = await db.client.findUnique({ where: { id: client.id } });
    expect(c!.ustaStatus).toBeNull();
  });

  it("PENDING'da orqasi yo'q — ariza butunlay o'chadi (faqat boshliq)", async () => {
    const { req } = await makeReturnRequest("PENDING");
    await loginAs(await makeUser("MANAGER"));

    const res = await revertReturnRequest(req.id);

    expect(res.ok).toBe(true);
    const after = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(after).toBeNull();
  });
});

// Yakunlash izohlari — HAQIQIY bazaga qarshi.
//
// Takliflar (Suggestion) uchun izoh IXTIYORIY: yozilsa saqlanadi, yozilmasa
// amal baribir bajariladi. Qaytarish/eskalatsiya uchun esa izoh MAJBURIY —
// izohsiz amal bloklanadi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { resolveSuggestion, reopenSuggestion } from "./suggestions";
import { confirmReturnCollected } from "./equipment";
import { resolveEscalation } from "./usta";
import { resetDb, makeUser, makeClient, makeEquipment, loginAs, stockOf } from "@/test/fixtures";

async function makeSuggestion(clientId: string) {
  return db.suggestion.create({
    data: { clientId, body: "Kassaga chegirma tugmasi kerak", status: "OPEN" },
  });
}

/** Ijara uskunasi biriktirilgan mijoz + ustaga tayinlangan qaytarish arizasi. */
async function makeReturnRequest() {
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
      status: "APPROVED",
      ustaId: usta.id,
    },
  });
  return { req, client, usta, type };
}

describe("resolveSuggestion — izoh ixtiyoriy", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("izoh berilsa saqlanadi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const s = await makeSuggestion((await makeClient()).id);

    const res = await resolveSuggestion(s.id, "  Keyingi versiyaga rejaga qo'shildi  ");

    expect(res.ok).toBe(true);
    const after = await db.suggestion.findUnique({ where: { id: s.id } });
    expect(after!.status).toBe("RESOLVED");
    expect(after!.resolutionNote, "bo'sh joylar kesiladi").toBe(
      "Keyingi versiyaga rejaga qo'shildi",
    );
  });

  it("izohsiz ham hal qilinadi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const s = await makeSuggestion((await makeClient()).id);

    const res = await resolveSuggestion(s.id);

    expect(res.ok).toBe(true);
    const after = await db.suggestion.findUnique({ where: { id: s.id } });
    expect(after!.status).toBe("RESOLVED");
    expect(after!.resolutionNote).toBeNull();
  });

  it("qayta ochilganda eski izoh tozalanadi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const s = await makeSuggestion((await makeClient()).id);

    await resolveSuggestion(s.id, "bajarildi");
    await reopenSuggestion(s.id);

    const after = await db.suggestion.findUnique({ where: { id: s.id } });
    expect(after!.status).toBe("OPEN");
    expect(after!.resolutionNote).toBeNull();
  });
});

describe("confirmReturnCollected — izoh majburiy", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("izoh saqlanadi, ariza sababiga tegilmaydi", async () => {
    const { req, type, usta } = await makeReturnRequest();
    await loginAs(await makeUser("MANAGER"));

    const res = await confirmReturnCollected(req.id, "Printer shikastlangan holda qaytdi");

    expect(res.ok).toBe(true);
    const after = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe("DONE");
    expect(after!.resolutionNote).toBe("Printer shikastlangan holda qaytdi");
    expect(after!.note, "arizaning asl sababi joyida qoladi").toBe("Mijoz ijaradan voz kechdi");
    expect(await stockOf(type.id, "USTA", usta.id), "uskuna usta zaxirasiga o'tadi").toBe(2);
  });

  it("izohsiz yakunlab bo'lmaydi", async () => {
    const { req } = await makeReturnRequest();
    await loginAs(await makeUser("MANAGER"));

    const res = await confirmReturnCollected(req.id, "");

    expect(res.ok).toBe(false);
    const after = await db.equipmentReturnRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe("APPROVED");
  });
});

describe("resolveEscalation — izoh majburiy", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("izoh berilsa qo'ng'iroq jurnaliga o'sha matn tushadi", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient({ assignedToId: op.id });
    await db.client.update({ where: { id: client.id }, data: { stage: "ESCALATED" } });
    await loginAs(op);

    const res = await resolveEscalation(client.id, "Telefon orqali sozlab berildi");

    expect(res.ok).toBe(true);
    const log = await db.callLog.findFirst({ where: { clientId: client.id, result: "DONE" } });
    expect(log!.note).toBe("Telefon orqali sozlab berildi");
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.stage).toBe("RESOLVED");
  });

  it("izohsiz yopib bo'lmaydi", async () => {
    const manager = await makeUser("MANAGER");
    const client = await makeClient();
    await db.client.update({ where: { id: client.id }, data: { stage: "ESCALATED" } });
    await loginAs(manager);

    const res = await resolveEscalation(client.id, "");

    expect(res.ok).toBe(false);
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.stage).toBe("ESCALATED");
  });
});

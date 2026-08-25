// Kunlik lid katagi (saveLeadCell) — avto yon-yozuvlar (muammo/taklif/qaytarish)
// bilan bog'liq integratsion testlar.
//
// Asosiy talab: operator xato bilan "Muammo bor" (yoki taklif/qaytarish) tanlab,
// darhol boshqa holatga o'tsa — mijoz o'sha bo'lim ro'yxatida QOLMASLIGI kerak
// (avto yaratilgan pristine yozuv o'chadi). Ammo boshliq/usta ish boshlagan
// yozuv o'chmasligi kerak.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { saveLeadCell } from "./leads";
import { resetDb, makeUser, makeClient, loginAs } from "@/test/fixtures";

const openTickets = (clientId: string) =>
  db.ticket.count({ where: { clientId, status: { in: ["OPEN", "IN_PROGRESS"] } } });

describe("saveLeadCell — xato natijadan o'tish avto-yozuvni tozalaydi", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("HAS_ISSUE muammo (ticket) ochadi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    await saveLeadCell(client.id, "HAS_ISSUE", "kassa ishlamayapti");

    expect(await openTickets(client.id)).toBe(1);
  });

  it("HAS_ISSUE izohsiz saqlanmaydi — tavsif majburiy", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    const res = await saveLeadCell(client.id, "HAS_ISSUE", "  ");

    expect(res.error).toBeTruthy();
    expect(await openTickets(client.id)).toBe(0); // muammo ochilmaydi
  });

  it("HAS_ISSUE → NO_PROBLEM: xato muammo o'chadi (mijoz Muammolarda qolmaydi)", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    await saveLeadCell(client.id, "HAS_ISSUE", "xato bosildi");
    expect(await openTickets(client.id)).toBe(1);

    // Operator darhol to'g'ri holatga o'tadi
    await saveLeadCell(client.id, "NO_PROBLEM", "aslida gaplashildi, muammo yo'q");

    expect(await openTickets(client.id)).toBe(0);
    // Bugungi yozuv natijasi ham yangilangan bo'lishi kerak
    const log = await db.callLog.findFirst({
      where: { clientId: client.id },
      orderBy: { calledAt: "desc" },
    });
    expect(log!.result).toBe("NO_PROBLEM");
  });

  it("boshliq ish boshlagan (biriktirilgan) muammo O'CHMAYDI", async () => {
    const op = await makeUser("OPERATOR");
    const staff = await makeUser("MANAGER");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    await saveLeadCell(client.id, "HAS_ISSUE", "haqiqiy muammo");
    // Boshliq muammoni o'ziga biriktiradi (ish boshlandi — endi pristine emas)
    const ticket = await db.ticket.findFirst({ where: { clientId: client.id } });
    await db.ticket.update({
      where: { id: ticket!.id },
      data: { assignedStaffId: staff.id, status: "IN_PROGRESS" },
    });

    // Operator baribir katakni boshqa holatga o'zgartiradi
    await saveLeadCell(client.id, "NO_PROBLEM", "gaplashildi");

    expect(await openTickets(client.id)).toBe(1); // saqlanadi
  });

  it("SUGGESTION → NO_PROBLEM: xato taklif o'chadi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    await saveLeadCell(client.id, "SUGGESTION", "yangi funksiya taklifi");
    expect(await db.suggestion.count({ where: { clientId: client.id } })).toBe(1);

    await saveLeadCell(client.id, "NO_PROBLEM", "aslida taklif emas");

    expect(await db.suggestion.count({ where: { clientId: client.id, status: "OPEN" } })).toBe(0);
  });

  it("RETURN_EQUIPMENT → NO_PROBLEM: xato qaytarish arizasi o'chadi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    await saveLeadCell(client.id, "RETURN_EQUIPMENT", "uskuna qaytariladi");
    expect(
      await db.equipmentReturnRequest.count({ where: { clientId: client.id, status: "PENDING" } }),
    ).toBe(1);

    await saveLeadCell(client.id, "NO_PROBLEM", "qaytarish kerak emas");

    expect(
      await db.equipmentReturnRequest.count({ where: { clientId: client.id, status: "PENDING" } }),
    ).toBe(0);
  });

  it("HAS_ISSUE ni qayta tanlash (izoh tahriri) ticketni dublikat qilmaydi/o'chirmaydi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    await saveLeadCell(client.id, "HAS_ISSUE", "birinchi izoh");
    await saveLeadCell(client.id, "HAS_ISSUE", "izoh tuzatildi");

    expect(await openTickets(client.id)).toBe(1);
  });

  it("NEEDS_UPDATE — 'Yangi versiya' ticket ochadi (izohsiz ham)", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    // HAS_ISSUE'dan farqli — izoh majburiy EMAS.
    const res = await saveLeadCell(client.id, "NEEDS_UPDATE", null);

    expect(res.error).toBeFalsy();
    const ticket = await db.ticket.findFirst({ where: { clientId: client.id } });
    expect(ticket?.type).toBe("VERSION_UPDATE");
    expect(ticket?.title).toBe("Yangi versiya o'rnatish kerak");
  });

  it("NEEDS_UPDATE → NO_PROBLEM: xato versiya ticket o'chadi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    await saveLeadCell(client.id, "NEEDS_UPDATE", null);
    expect(await openTickets(client.id)).toBe(1);

    await saveLeadCell(client.id, "NO_PROBLEM", "xato bosildi");

    expect(await openTickets(client.id)).toBe(0);
  });

  it("avvaldan ochiq HAS_ISSUE ticket NEEDS_UPDATE yaratilishiga to'sqinlik qilmaydi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ assignedToId: op.id });

    // Boshqa kundan qolgan, allaqachon ochiq texnik muammo (biriktirilgan —
    // pristine emas, shuning uchun bugungi natija almashsa ham o'chmaydi).
    await db.ticket.create({
      data: {
        clientId: client.id,
        title: "eski texnik muammo",
        type: "TECHNICAL",
        status: "IN_PROGRESS",
        assignedStaffId: op.id,
      },
    });

    await saveLeadCell(client.id, "NEEDS_UPDATE", "yangi versiya kerak");

    expect(await openTickets(client.id)).toBe(2);
  });
});

// Bo'limlarga o'tkazilgan/holat o'zgargan sanalar — HAQIQIY bazaga qarshi.
//
// Eskalatsiya, Jarayonda (usta) va Muammolar bo'limlariga kirish hamda ular
// ichidagi holat o'zgarishlari CallLog sifatida yoziladi — shu bilan ham
// "Qo'ng'iroqlar tarixi"da, ham bo'lim ichida sana ko'rinadi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { escalateLead } from "./leads";
import { assignEscalationStaff } from "./usta";
import {
  createTicket,
  setTicketStatus,
  dismissTicket,
  assignTicketStaff,
  assignTicketUsta,
} from "./tickets";
import { resetDb, makeUser, makeClient, loginAs, formData } from "@/test/fixtures";

async function lastCallLog(clientId: string) {
  return db.callLog.findFirst({ where: { clientId }, orderBy: { calledAt: "desc" } });
}

describe("Eskalatsiya — o'tkazilgan/holat o'zgargan sana", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("qo'lda eskalatsiya qilinganda CallLog(ESCALATED) yoziladi", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient({ assignedToId: op.id });
    await loginAs(op);

    const res = await escalateLead(client.id);

    expect(res.ok).toBe(true);
    const log = await lastCallLog(client.id);
    expect(log!.result).toBe("ESCALATED");
    expect(log!.operatorId).toBe(op.id);
  });

  it("mas'ul biriktirilganda/olib tashlanganda CallLog yoziladi", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("OPERATOR");
    const client = await makeClient();
    await db.client.update({ where: { id: client.id }, data: { stage: "ESCALATED" } });
    await loginAs(admin);

    const r1 = await assignEscalationStaff(client.id, staff.id, "mas'ul biriktirildi");
    expect(r1.ok).toBe(true);
    let log = await lastCallLog(client.id);
    expect(log!.result).toBe("ESCALATION_STAFF_ASSIGNED");

    const r2 = await assignEscalationStaff(client.id, null);
    expect(r2.ok).toBe(true);
    log = await lastCallLog(client.id);
    expect(log!.result).toBe("UNASSIGNED");
  });
});

describe("Muammolar — o'tkazilgan/holat o'zgargan sana", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("qo'lda muammo ochilganda CallLog(HAS_ISSUE) yoziladi", async () => {
    const manager = await makeUser("MANAGER");
    const client = await makeClient();
    await loginAs(manager);

    const res = await createTicket(
      {},
      formData({ clientId: client.id, title: "Printer ishlamayapti", type: "TECHNICAL", priority: "MEDIUM" }),
    );

    expect(res.ok).toBe(true);
    const log = await lastCallLog(client.id);
    expect(log!.result).toBe("HAS_ISSUE");
    expect(log!.note).toBe("Printer ishlamayapti");
  });

  it("holat o'zgarganda (jarayonga/hal qilindi/qayta ochish) CallLog yoziladi", async () => {
    const manager = await makeUser("MANAGER");
    const client = await makeClient();
    const ticket = await db.ticket.create({
      data: { clientId: client.id, title: "Muammo", type: "TECHNICAL", priority: "MEDIUM", status: "OPEN" },
    });
    await loginAs(manager);

    await setTicketStatus(ticket.id, "IN_PROGRESS", formData({}));
    expect((await lastCallLog(client.id))!.result).toBe("TICKET_IN_PROGRESS");

    await setTicketStatus(ticket.id, "RESOLVED", formData({ resolutionNote: "Kabel almashtirildi" }));
    const log = await lastCallLog(client.id);
    expect(log!.result).toBe("RESOLVED");
    expect(log!.note).toBe("Kabel almashtirildi");

    await setTicketStatus(ticket.id, "OPEN", formData({ resolutionNote: "Qayta muammo chiqdi" }));
    expect((await lastCallLog(client.id))!.result).toBe("TICKET_REOPENED");
  });

  it("rad etilganda (dismissTicket) CallLog(TICKET_DISMISSED) yoziladi", async () => {
    const admin = await makeUser("ADMIN");
    const client = await makeClient();
    const ticket = await db.ticket.create({
      data: { clientId: client.id, title: "Muammo", type: "TECHNICAL", priority: "MEDIUM", status: "OPEN" },
    });
    await loginAs(admin);

    await dismissTicket(ticket.id, "xato ochilgan");

    expect((await lastCallLog(client.id))!.result).toBe("TICKET_DISMISSED");
  });

  it("mas'ul xodim biriktirilganda/olinganda CallLog yoziladi", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("OPERATOR");
    const client = await makeClient();
    const ticket = await db.ticket.create({
      data: { clientId: client.id, title: "Muammo", type: "TECHNICAL", priority: "MEDIUM", status: "OPEN" },
    });
    await loginAs(admin);

    await assignTicketStaff(ticket.id, staff.id, "mas'ul biriktirildi");
    let log = await lastCallLog(client.id);
    expect(log!.result).toBe("TICKET_STAFF_ASSIGNED");
    expect(log!.note).toContain(staff.name);

    await assignTicketStaff(ticket.id, null);
    log = await lastCallLog(client.id);
    expect(log!.result).toBe("UNASSIGNED");
  });

  it("usta biriktirilganda/olinganda CallLog yoziladi", async () => {
    const admin = await makeUser("ADMIN");
    const usta = await makeUser("INSTALLER");
    const client = await makeClient();
    const ticket = await db.ticket.create({
      data: { clientId: client.id, title: "Muammo", type: "TECHNICAL", priority: "MEDIUM", status: "OPEN" },
    });
    await loginAs(admin);

    await assignTicketUsta(ticket.id, usta.id);
    let log = await lastCallLog(client.id);
    expect(log!.result).toBe("ASSIGNED");
    expect(log!.note).toContain(usta.name);

    await assignTicketUsta(ticket.id, null);
    log = await lastCallLog(client.id);
    expect(log!.result).toBe("UNASSIGNED");
  });
});

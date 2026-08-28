// Muammoni "xato ochilgan" deb rad etish (dismissTicket) — haqiqiy bazaga qarshi.
// Diqqat: RUXSAT (faqat boshliq/admin) va yakuniy holat (RESOLVED + izoh).

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { dismissTicket, resolveVersionTicket } from "./tickets";
import { resetDb, makeUser, makeClient, loginAs, logout } from "@/test/fixtures";

async function makeTicket(clientId: string) {
  return db.ticket.create({
    data: { clientId, title: "Test muammo", type: "TECHNICAL", priority: "MEDIUM", status: "OPEN" },
  });
}

describe("dismissTicket", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("boshliq muammoni rad etadi — RESOLVED + izoh", async () => {
    const manager = await makeUser("MANAGER");
    const client = await makeClient();
    const ticket = await makeTicket(client.id);

    await loginAs(manager);
    const res = await dismissTicket(ticket.id, "mijoz bilan aniqlashtirilmagan");

    expect(res.ok).toBe(true);
    const after = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(after!.status).toBe("RESOLVED");
    expect(after!.resolvedAt).not.toBeNull();
    expect(after!.resolutionNote).toContain("Xato ochilgan");
  });

  it("operator rad eta OLMAYDI (faqat boshliq/admin)", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const ticket = await makeTicket(client.id);

    await loginAs(op);
    const res = await dismissTicket(ticket.id, "xato ochilgan");

    expect(res.ok).toBe(false);
    const after = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(after!.status).toBe("OPEN"); // o'zgarmaydi
  });

  it("izohsiz rad eta OLMAYDI", async () => {
    const manager = await makeUser("MANAGER");
    const client = await makeClient();
    const ticket = await makeTicket(client.id);

    await loginAs(manager);
    const res = await dismissTicket(ticket.id, "");

    expect(res.ok).toBe(false);
    const after = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(after!.status).toBe("OPEN");
  });

  it("audit jurnaliga yoziladi", async () => {
    const admin = await makeUser("ADMIN");
    const client = await makeClient();
    const ticket = await makeTicket(client.id);

    await loginAs(admin);
    await dismissTicket(ticket.id, "xato ochilgan");

    const audit = await db.auditLog.findFirst({ where: { action: { contains: "rad etildi" } } });
    expect(audit).not.toBeNull();
  });
});

async function makeVersionTicket(clientId: string, over: Partial<{ status: string }> = {}) {
  return db.ticket.create({
    data: {
      clientId,
      title: "Yangi versiya o'rnatish kerak",
      type: "VERSION_UPDATE",
      priority: "MEDIUM",
      status: over.status ?? "OPEN",
    },
  });
}

describe("resolveVersionTicket", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ticketni RESOLVED qiladi VA mijoz appVersion'ini yangilaydi", async () => {
    const op = await makeUser("OPERATOR");
    const client = await makeClient();
    const ticket = await makeVersionTicket(client.id, { status: "IN_PROGRESS" });

    await loginAs(op);
    const res = await resolveVersionTicket(ticket.id, "V3");

    expect(res.ok).toBe(true);
    const afterTicket = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(afterTicket!.status).toBe("RESOLVED");
    expect(afterTicket!.resolvedAt).not.toBeNull();
    expect(afterTicket!.resolutionNote).toContain("v3");
    const afterClient = await db.client.findUnique({ where: { id: client.id } });
    expect(afterClient!.appVersion).toBe("V3");
  });

  it("noto'g'ri versiya rad etiladi, hech narsa o'zgarmaydi", async () => {
    const admin = await makeUser("ADMIN");
    const client = await makeClient();
    const ticket = await makeVersionTicket(client.id);

    await loginAs(admin);
    const res = await resolveVersionTicket(ticket.id, "V9");

    expect(res.ok).toBe(false);
    const afterTicket = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(afterTicket!.status).toBe("OPEN");
    const afterClient = await db.client.findUnique({ where: { id: client.id } });
    expect(afterClient!.appVersion).toBeNull();
  });

  it("oddiy (TECHNICAL) ticketda ishlamaydi", async () => {
    const admin = await makeUser("ADMIN");
    const client = await makeClient();
    const ticket = await db.ticket.create({
      data: { clientId: client.id, title: "Boshqa muammo", type: "TECHNICAL", status: "OPEN" },
    });

    await loginAs(admin);
    const res = await resolveVersionTicket(ticket.id, "V1");

    expect(res.ok).toBe(false);
    const afterTicket = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(afterTicket!.status).toBe("OPEN");
  });

  it("sessiyasiz chaqirilsa rad etiladi", async () => {
    logout();
    const client = await makeClient();
    const ticket = await makeVersionTicket(client.id);

    const res = await resolveVersionTicket(ticket.id, "V1");

    expect(res.ok).toBe(false);
  });
});

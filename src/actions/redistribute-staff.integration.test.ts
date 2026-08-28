// Ishdan ketgan xodimning ochiq ishlarini (muammo/eskalatsiya/qaytarish)
// qolgan faol TP xodimlari orasida teng taqsimlash — HAQIQIY bazaga qarshi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { redistributeStaffWork } from "./users";
import { resetDb, makeUser, makeClient, loginAs } from "@/test/fixtures";

describe("redistributeStaffWork", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("muammo/eskalatsiya/qaytarishni faol operatorlar orasida round-robin taqsimlaydi", async () => {
    const admin = await makeUser("ADMIN");
    const departed = await makeUser("OPERATOR", { name: "Biloliddin", isActive: false });
    const op1 = await makeUser("OPERATOR", { name: "Anvar" });
    const op2 = await makeUser("OPERATOR", { name: "Bahtiyor" });
    await loginAs(admin);

    const c1 = await makeClient();
    const c2 = await makeClient();
    const c3 = await makeClient();
    const c4 = await makeClient();

    const t1 = await db.ticket.create({
      data: { clientId: c1.id, title: "Muammo 1", assignedStaffId: departed.id, status: "OPEN" },
    });
    const t2 = await db.ticket.create({
      data: { clientId: c2.id, title: "Muammo 2", assignedStaffId: departed.id, status: "IN_PROGRESS" },
    });
    // Hal qilingan muammo — taqsimlanmasligi kerak
    await db.ticket.create({
      data: { clientId: c1.id, title: "Hal bo'lgan", assignedStaffId: departed.id, status: "RESOLVED" },
    });

    await db.client.update({
      where: { id: c3.id },
      data: { stage: "ESCALATED", escalationStaffId: departed.id },
    });

    const ret = await db.equipmentReturnRequest.create({
      data: { clientId: c4.id, status: "APPROVED", staffId: departed.id, ustaId: null, note: "sabab" },
    });

    const res = await redistributeStaffWork(departed.id);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tickets).toBe(2);
    expect(res.escalations).toBe(1);
    expect(res.returns).toBe(1);
    expect(res.recipients.sort()).toEqual(["Anvar", "Bahtiyor"]);

    const ticket1 = await db.ticket.findUnique({ where: { id: t1.id } });
    const ticket2 = await db.ticket.findUnique({ where: { id: t2.id } });
    expect(ticket1!.assignedStaffId).toBe(op1.id);
    expect(ticket2!.assignedStaffId).toBe(op2.id);

    const client3 = await db.client.findUnique({ where: { id: c3.id } });
    expect(client3!.escalationStaffId).toBe(op1.id);

    const returnReq = await db.equipmentReturnRequest.findUnique({ where: { id: ret.id } });
    expect(returnReq!.staffId).toBe(op1.id);
  });

  it("faol operator qolmasa xato qaytaradi", async () => {
    const admin = await makeUser("ADMIN");
    const departed = await makeUser("OPERATOR", { isActive: false });
    await loginAs(admin);

    const res = await redistributeStaffWork(departed.id);

    expect(res.ok).toBe(false);
  });

  it("ADMIN bo'lmagan chaqira olmaydi", async () => {
    const manager = await makeUser("MANAGER");
    const departed = await makeUser("OPERATOR", { isActive: false });
    await makeUser("OPERATOR");
    await loginAs(manager);

    const res = await redistributeStaffWork(departed.id);

    expect(res.ok).toBe(false);
  });
});

// updateUstaStatus — usta (veb login) endi FAQAT o'ziga biriktirilgan
// vazifasini yangilay oladi — HAQIQIY bazaga qarshi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { updateUstaStatus } from "./usta";
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

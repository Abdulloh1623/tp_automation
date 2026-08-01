// Mijozni tahrirlash — pul maydonlari nazorati.
//
// Auditda topilgan muammo: operator `updateClient` orqali `debtAmount: 0`
// qo'yib, chek ham, Payment yozuvi ham bo'lmagan holda qarzni o'chira olardi —
// ya'ni "chek majburiy" nazorati aylanib o'tilardi (PR #103 da tuzatilgan).
// Bu testlar o'sha tuzatishni qulflaydi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { updateClient, deactivateRefusedClients } from "./clients";
import { resetDb, makeUser, makeClient, loginAs, logout } from "@/test/fixtures";
import { RedirectError } from "@/test/integration-setup";

/** updateClient to'liq forma kutadi — mavjud qiymatlardan forma yasaymiz. */
function clientForm(
  base: { fullName: string; restaurantName: string; phone: string; currency: string },
  over: Record<string, string> = {},
): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    fullName: base.fullName,
    restaurantName: base.restaurantName,
    phone: base.phone,
    currency: base.currency,
    status: "ACTIVE",
    // ACTIVE mijoz uchun majburiy (requireActivePaymentDate)
    nextPaymentDate: "2026-12-31",
    monthlyAmount: "29",
    debtAmount: "0",
    monoblokCount: "1",
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

/**
 * `updateClient` muvaffaqiyatda `redirect()` chaqiradi — u Next.js'da maxsus
 * xato otish orqali ishlaydi. Testda uni "muvaffaqiyat" deb talqin qilamiz;
 * haqiqiy xato bo'lsa action natija obyektini qaytaradi.
 */
async function update(
  id: string,
  fd: FormData,
): Promise<{ error?: string; redirected?: boolean }> {
  try {
    const res = await updateClient(id, {}, fd);
    return res ?? {};
  } catch (e) {
    if (e instanceof RedirectError) return { redirected: true };
    throw e;
  }
}

describe("updateClient — pul maydonlari", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("OPERATOR qarzni o'zgartira OLMAYDI (chek nazorati aylanib o'tilmasin)", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ debtAmount: 500, monthlyAmount: 29 });

    const res = await update(client.id, clientForm(client, { debtAmount: "0" }));

    expect(res.error).toBeFalsy(); // amal muvaffaqiyatli...
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.debtAmount, "qarz o'zgarmasligi kerak").toBe(500); // ...lekin qarz saqlanadi
  });

  it("OPERATOR oylik summani ham o'zgartira olmaydi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ monthlyAmount: 29, debtAmount: 100 });

    await update(client.id, clientForm(client, { monthlyAmount: "999", debtAmount: "0" }));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.monthlyAmount).toBe(29);
    expect(after!.debtAmount).toBe(100);
  });

  it("OPERATOR boshqa maydonlarni odatdagidek tahrirlaydi", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op);
    const client = await makeClient({ debtAmount: 500 });

    await update(client.id, clientForm(client, { restaurantName: "Yangi nom", debtAmount: "0" }));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.restaurantName, "nom o'zgarishi kerak").toBe("Yangi nom");
    expect(after!.debtAmount, "qarz esa yo'q").toBe(500);
  });

  it("ADMIN qarzni o'zgartira OLADI (qo'lda tuzatish uchun)", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ debtAmount: 500 });

    await update(client.id, clientForm(client, { debtAmount: "0" }));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.debtAmount).toBe(0);
  });

  it("MANAGER ham qarzni o'zgartira oladi", async () => {
    const mgr = await makeUser("MANAGER");
    await loginAs(mgr);
    const client = await makeClient({ debtAmount: 500 });

    await update(client.id, clientForm(client, { debtAmount: "250" }));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.debtAmount).toBe(250);
  });

  it("OPERATOR boshqa operatorning mijozini O'ZIGA o'tkaza olmaydi", async () => {
    const owner = await makeUser("OPERATOR", { username: "egasi" });
    const other = await makeUser("OPERATOR", { username: "boshqa" });
    await loginAs(other);
    const client = await makeClient({ assignedToId: owner.id });

    await update(client.id, clientForm(client, { assignedToId: other.id }));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.assignedToId, "biriktiruv o'zgarmasligi kerak").toBe(owner.id);
  });

  it("har tahrir audit jurnaliga o'zgargan maydonlar bilan tushadi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ restaurantName: "Eski nom" });

    await update(client.id, clientForm(client, { restaurantName: "Yangi nom" }));

    const log = await db.auditLog.findFirst({ where: { action: "CLIENT_UPDATE" } });
    expect(log).not.toBeNull();
    expect(log!.detail).toContain("restaurantName");
    expect(log!.userId).toBe(admin.id);
  });

  it("sessiyasiz tahrirlab bo'lmaydi", async () => {
    const client = await makeClient({ restaurantName: "Tegilmasin" });
    logout();

    const res = await update(client.id, clientForm(client, { restaurantName: "Buzildi" }));

    expect(res.error).toBeTruthy();
    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.restaurantName).toBe("Tegilmasin");
  });

  it("status INACTIVE bo'lsa churn vaqti yoziladi, qaytarilsa tozalanadi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ status: "ACTIVE" });

    await update(client.id, clientForm(client, { status: "INACTIVE" }));
    let after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.deactivatedAt, "yo'qotish vaqti yozilishi kerak").not.toBeNull();

    await update(client.id, clientForm(client, { status: "ACTIVE" }));
    after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.deactivatedAt, "qayta faollashsa tozalanishi kerak").toBeNull();
  });
});

// Eski importlar `stage: REFUSED` qo'yib `status` ni tegmagan — natijada otkaz
// mijoz "Faol" bo'lib qolib, oyligi MRR ga qo'shilib turardi. Ilovaning o'z
// otkaz yo'llari ikkalasini ham qo'yadi; bu amal eski qoldiqni tuzatadi.
describe("deactivateRefusedClients (otkaz, lekin hali faol)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const refusedActive = () =>
    makeClient({ status: "ACTIVE" }).then((c) =>
      db.client.update({ where: { id: c.id }, data: { stage: "REFUSED" } }),
    );

  it("otkazdagi faol mijozni nofaol qiladi va churn sanasini yozadi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const c = await refusedActive();

    const res = await deactivateRefusedClients();

    expect(res.ok).toBe(true);
    expect(res.fixed).toBe(1);
    const after = await db.client.findUnique({ where: { id: c.id } });
    expect(after!.status).toBe("INACTIVE");
    expect(after!.stage, "bosqich o'zgarmaydi").toBe("REFUSED");
    expect(after!.deactivatedAt).not.toBeNull();
  });

  it("otkazda BO'LMAGAN faol mijozga tegmaydi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const ok = await makeClient({ status: "ACTIVE" });
    await refusedActive();

    const res = await deactivateRefusedClients();

    expect(res.fixed).toBe(1);
    const after = await db.client.findUnique({ where: { id: ok.id } });
    expect(after!.status).toBe("ACTIVE");
  });

  it("mavjud churn sanasini QAYTA yozmaydi", async () => {
    await loginAs(await makeUser("ADMIN"));
    const old = new Date("2026-01-15T00:00:00.000Z");
    const c = await refusedActive();
    await db.client.update({ where: { id: c.id }, data: { deactivatedAt: old } });

    await deactivateRefusedClients();

    const after = await db.client.findUnique({ where: { id: c.id } });
    expect(after!.deactivatedAt?.toISOString()).toBe(old.toISOString());
  });

  it("OPERATOR va MANAGER qila olmaydi", async () => {
    for (const role of ["OPERATOR", "MANAGER"] as const) {
      await resetDb();
      await loginAs(await makeUser(role));
      const c = await refusedActive();

      const res = await deactivateRefusedClients();

      expect(res.ok, `rol ${role}`).toBe(false);
      const after = await db.client.findUnique({ where: { id: c.id } });
      expect(after!.status).toBe("ACTIVE");
    }
  });

  it("tuzatiladigan mijoz bo'lmasa — 0 qaytaradi", async () => {
    await loginAs(await makeUser("ADMIN"));

    const res = await deactivateRefusedClients();

    expect(res.ok).toBe(true);
    expect(res.fixed).toBe(0);
  });
});

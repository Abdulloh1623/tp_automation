// Mijozni tahrirlash — pul maydonlari nazorati.
//
// Auditda topilgan muammo: operator `updateClient` orqali `debtAmount: 0`
// qo'yib, chek ham, Payment yozuvi ham bo'lmagan holda qarzni o'chira olardi —
// ya'ni "chek majburiy" nazorati aylanib o'tilardi (PR #103 da tuzatilgan).
// Bu testlar o'sha tuzatishni qulflaydi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { updateClient } from "./clients";
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

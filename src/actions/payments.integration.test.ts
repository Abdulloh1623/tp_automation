// To'lov yozish — haqiqiy bazaga qarshi integratsion testlar.
//
// Bu yerda tekshiriladigan narsa: CHEK MAJBURIYLIGI va to'lov qamrovi
// (nextPaymentDate) to'g'ri hisoblanishi. Ikkalasi ham pul bilan bog'liq va
// unit testlar bilan qoplanmagan edi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { recordPayment } from "./payments";
import { rejectAllPendingPayments } from "./pending-payments";
import {
  resetDb,
  makeUser,
  makeClient,
  loginAs,
  logout,
  formData,
  PNG_1PX,
} from "@/test/fixtures";

const receipt = { field: "receipt", name: "chek.png", type: "image/png", data: PNG_1PX };

/** Bugundan N kun keyingi sana (soatlarsiz solishtirish uchun). */
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const sameDay = (a: Date | null, b: Date) =>
  !!a && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

describe("recordPayment", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("CHEKSIZ to'lov yozilmaydi — bu asosiy nazorat", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient();

    const res = await recordPayment(
      client.id,
      formData({ amount: "29", currency: "USD", days: "30" }), // fayl YO'Q
    );

    expect(res.error).toBe("Chek rasmi majburiy");
    expect(await db.payment.count()).toBe(0);
  });

  it("bo'sh fayl ham chek hisoblanmaydi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient();

    const res = await recordPayment(
      client.id,
      formData({ amount: "29", currency: "USD", days: "30" }, { ...receipt, data: Buffer.alloc(0) }),
    );

    expect(res.error).toBeTruthy();
    expect(await db.payment.count()).toBe(0);
  });

  it("chek bilan — to'lov yoziladi va chek fayli biriktiriladi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ currency: "USD" });

    const res = await recordPayment(
      client.id,
      formData({ amount: "29", currency: "USD", days: "30" }, receipt),
    );

    expect(res.ok).toBe(true);
    const p = await db.payment.findFirst({ where: { clientId: client.id } });
    expect(p).not.toBeNull();
    expect(p!.amount).toBe(29);
    expect(p!.currency).toBe("USD");
    expect(p!.receiptPath, "chek yo'li yozilishi kerak").toBeTruthy();
    expect(p!.recordedById).toBe(admin.id);
  });

  it("qamrov: sana yo'q bo'lsa BUGUNDAN + kunlar", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ nextPaymentDate: undefined });

    await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(sameDay(after!.nextPaymentDate, daysFromNow(30))).toBe(true);
  });

  it("qamrov: kelajakdagi sana bo'lsa — USTIGA qo'shiladi (kun yo'qolmaydi)", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    // Mijozning qamrovi hali 10 kun bor
    const client = await makeClient({ nextPaymentDate: daysFromNow(10) });

    await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    const after = await db.client.findUnique({ where: { id: client.id } });
    // 10 + 30 = 40 kun (bugundan 30 EMAS — aks holda mijoz 10 kunini yo'qotardi)
    expect(sameDay(after!.nextPaymentDate, daysFromNow(40))).toBe(true);
  });

  it("qamrov: o'tgan sana bo'lsa — bugundan boshlanadi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ nextPaymentDate: daysFromNow(-20) });

    await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(sameDay(after!.nextPaymentDate, daysFromNow(30))).toBe(true);
  });

  it("to'lovdan keyin mijoz ACTIVE bo'ladi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ status: "INACTIVE" });

    await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.status).toBe("ACTIVE");
  });

  it("audit jurnaliga yoziladi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient({ restaurantName: "Test Kafe" });

    await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    const log = await db.auditLog.findFirst({ where: { action: "To'lov qabul qilindi" } });
    expect(log).not.toBeNull();
    expect(log!.userId).toBe(admin.id);
    expect(log!.detail).toContain("Test Kafe");
  });

  it("sessiyasiz — yozilmaydi", async () => {
    const client = await makeClient();
    logout();

    const res = await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    expect(res.error).toBeTruthy();
    expect(await db.payment.count()).toBe(0);
  });

  it("INSTALLER (usta) to'lov yoza olmaydi", async () => {
    const usta = await makeUser("INSTALLER");
    await loginAs(usta);
    const client = await makeClient();

    const res = await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    expect(res.error).toBeTruthy();
    expect(await db.payment.count()).toBe(0);
  });

  it("faolsizlantirilgan xodim to'lov yoza olmaydi (sessiya amal qilsa ham)", async () => {
    const op = await makeUser("OPERATOR");
    await loginAs(op); // sessiya olindi
    await db.user.update({ where: { id: op.id }, data: { isActive: false } }); // keyin bloklandi
    const client = await makeClient();

    const res = await recordPayment(client.id, formData({ amount: "29", days: "30" }, receipt));

    expect(res.error).toBeTruthy();
    expect(await db.payment.count()).toBe(0);
  });

  it("mavjud bo'lmagan mijoz", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);

    const res = await recordPayment("yoq-bunday-id", formData({ amount: "29", days: "30" }, receipt));

    expect(res.error).toBeTruthy();
    expect(await db.payment.count()).toBe(0);
  });

  it("noto'g'ri summa — yozilmaydi", async () => {
    const admin = await makeUser("ADMIN");
    await loginAs(admin);
    const client = await makeClient();

    for (const amount of ["0", "-5", "abc", ""]) {
      const res = await recordPayment(client.id, formData({ amount, days: "30" }, receipt));
      expect(res.error, `summa "${amount}"`).toBeTruthy();
    }
    expect(await db.payment.count()).toBe(0);
  });
});

// Navbatni ommaviy rad etish — yuzlab chek yig'ilib qolganda bittalab
// bosish real emas. Muhim shart: YOZUV O'CHIRILMAYDI (Telegram dublikat
// kaliti saqlanadi), faqat status va chek fayli ketadi.
describe("rejectAllPendingPayments (navbatni ommaviy tozalash)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const makePending = (n: number, status = "PENDING") =>
    db.pendingPayment.create({
      data: {
        tgChatId: "-100",
        tgMessageId: String(n),
        status,
        receiptPath: `receipts/chek-${n}.jpg`,
        parsedName: `Chek ${n}`,
      },
    });

  it("barcha PENDING cheklarni rad etadi, yozuvni o'chirmaydi", async () => {
    await loginAs(await makeUser("ADMIN"));
    await makePending(1);
    await makePending(2);
    await makePending(3);

    const res = await rejectAllPendingPayments();

    expect(res.ok).toBe(true);
    expect(res.rejected).toBe(3);
    expect(await db.pendingPayment.count(), "qatorlar joyida qoladi").toBe(3);
    expect(await db.pendingPayment.count({ where: { status: "REJECTED" } })).toBe(3);
    const one = await db.pendingPayment.findFirst();
    expect(one!.receiptPath, "chek fayli yo'li tozalanadi").toBeNull();
    expect(one!.resolvedAt).not.toBeNull();
    expect(one!.rejectReason).toBeTruthy();
  });

  it("allaqachon ko'rib chiqilgan cheklarga TEGMAYDI", async () => {
    await loginAs(await makeUser("ADMIN"));
    await makePending(1, "CONFIRMED");
    await makePending(2, "REJECTED");
    await makePending(3);

    const res = await rejectAllPendingPayments();

    expect(res.rejected).toBe(1);
    const confirmed = await db.pendingPayment.findFirst({ where: { tgMessageId: "1" } });
    expect(confirmed!.status, "tasdiqlangan chek o'zgarmaydi").toBe("CONFIRMED");
    expect(confirmed!.receiptPath, "uning cheki ham saqlanadi").toBe("receipts/chek-1.jpg");
  });

  it("to'lov YARATMAYDI", async () => {
    await loginAs(await makeUser("ADMIN"));
    await makePending(1);

    await rejectAllPendingPayments();

    expect(await db.payment.count()).toBe(0);
  });

  it("OPERATOR va MANAGER qila olmaydi", async () => {
    for (const role of ["OPERATOR", "MANAGER"] as const) {
      await resetDb();
      await loginAs(await makeUser(role));
      await makePending(1);

      const res = await rejectAllPendingPayments();

      expect(res.error, `rol ${role}`).toBeTruthy();
      expect(await db.pendingPayment.count({ where: { status: "PENDING" } })).toBe(1);
    }
  });

  it("navbat bo'sh bo'lsa — 0 qaytaradi", async () => {
    await loginAs(await makeUser("ADMIN"));

    const res = await rejectAllPendingPayments();

    expect(res.ok).toBe(true);
    expect(res.rejected).toBe(0);
  });
});

// Ombor va uskuna — qoldiq matematikasi.
//
// Bu yerdagi asosiy savol: qoldiq HAR DOIM balansda qoladimi? Ombordan
// chiqqan uskuna ustaga yoki mijozga o'tishi kerak; yetmasa — HECH NARSA
// yozilmasligi kerak (rollback). Bular unit test bilan qoplanmagan edi.

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { transferToUsta, transferBatchToUsta, addStock, scrapToBrak } from "./inventory";
import { assignEquipmentToClient } from "./equipment";
import { resetDb, makeUser, makeClient, makeEquipment, loginAs, stockOf } from "@/test/fixtures";

describe("addStock (omborga kirim)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("qoldiqni oshiradi va harakat yozadi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const type = await makeEquipment("Monoblok");

    const res = await addStock(type.id, 10);

    expect(res.ok).toBe(true);
    expect(await stockOf(type.id)).toBe(10);
    const mv = await db.equipmentMovement.findFirst({ where: { equipmentTypeId: type.id } });
    expect(mv!.reason).toBe("Kirim");
    expect(mv!.toType).toBe("WAREHOUSE");
    expect(mv!.fromType, "kirimda manba yo'q").toBeNull();
  });

  it("OPERATOR omborga kirim qila olmaydi", async () => {
    await loginAs(await makeUser("OPERATOR"));
    const type = await makeEquipment("Monoblok");

    const res = await addStock(type.id, 10);

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(0);
  });

  it("nol yoki manfiy miqdor qabul qilinmaydi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const type = await makeEquipment("Monoblok", { warehouseQty: 5 });

    expect((await addStock(type.id, 0)).ok).toBe(false);
    expect((await addStock(type.id, -3)).ok).toBe(false);
    expect(await stockOf(type.id)).toBe(5);
  });
});

describe("transferToUsta (ombor -> usta)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("qoldiq ombordan ustaga KO'CHADI (yo'qolmaydi, ko'paymaydi)", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const type = await makeEquipment("Monoblok", { warehouseQty: 10 });

    const res = await transferToUsta(type.id, usta.id, 4, "Toshkent uchun");

    expect(res.ok).toBe(true);
    expect(await stockOf(type.id, "WAREHOUSE", "WAREHOUSE")).toBe(6);
    expect(await stockOf(type.id, "USTA", usta.id)).toBe(4);
    // Jami o'zgarmadi
    expect(6 + 4).toBe(10);
  });

  it("omborda yetarli bo'lmasa — HECH NARSA o'zgarmaydi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const type = await makeEquipment("Monoblok", { warehouseQty: 3 });

    const res = await transferToUsta(type.id, usta.id, 5, "izoh");

    expect(res.ok).toBe(false);
    expect(res.error).toContain("yetarli emas");
    expect(await stockOf(type.id)).toBe(3);
    expect(await stockOf(type.id, "USTA", usta.id)).toBe(0);
    expect(await db.equipmentMovement.count(), "harakat ham yozilmasligi kerak").toBe(0);
  });

  it("izoh majburiy", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const type = await makeEquipment("Monoblok", { warehouseQty: 10 });

    const res = await transferToUsta(type.id, usta.id, 1, "   ");

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(10);
  });

  it("nishon usta bo'lmasa — o'tkazilmaydi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const operator = await makeUser("OPERATOR");
    const type = await makeEquipment("Monoblok", { warehouseQty: 10 });

    const res = await transferToUsta(type.id, operator.id, 1, "izoh");

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(10);
  });
});

describe("transferBatchToUsta — tranzaksiya butunligi", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("bitta qator yiqilsa — BUTUN partiya bekor qilinadi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const ok = await makeEquipment("Monoblok", { warehouseQty: 10 });
    const low = await makeEquipment("Printer", { warehouseQty: 1 });

    const res = await transferBatchToUsta(
      usta.id,
      [
        { equipmentId: ok.id, quantity: 2 }, // bu bemalol
        { equipmentId: low.id, quantity: 5 }, // bu yetmaydi
      ],
      "partiya",
      "WITHOUT_DOC",
    );

    expect(res.ok).toBe(false);
    // Birinchi qator ham qo'llanmasligi kerak — aks holda qoldiq buziladi
    expect(await stockOf(ok.id), "birinchi qator ham bekor bo'lishi kerak").toBe(10);
    expect(await stockOf(low.id)).toBe(1);
    expect(await stockOf(ok.id, "USTA", usta.id)).toBe(0);
    expect(await db.equipmentMovement.count()).toBe(0);
  });

  it("hammasi joyida bo'lsa — barcha qatorlar qo'llanadi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const a = await makeEquipment("Monoblok", { warehouseQty: 10 });
    const b = await makeEquipment("Printer", { warehouseQty: 10 });

    const res = await transferBatchToUsta(
      usta.id,
      [
        { equipmentId: a.id, quantity: 2 },
        { equipmentId: b.id, quantity: 3 },
      ],
      "partiya",
      "WITHOUT_DOC",
    );

    expect(res.ok).toBe(true);
    expect(await stockOf(a.id)).toBe(8);
    expect(await stockOf(b.id)).toBe(7);
    expect(await stockOf(a.id, "USTA", usta.id)).toBe(2);
    expect(await stockOf(b.id, "USTA", usta.id)).toBe(3);
  });

  it("hujjatsiz rejimda izoh majburiy", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const type = await makeEquipment("Monoblok", { warehouseQty: 10 });

    const res = await transferBatchToUsta(
      usta.id,
      [{ equipmentId: type.id, quantity: 1 }],
      "",
      "WITHOUT_DOC",
    );

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(10);
  });

  it("hujjat manzili soxta bo'lsa rad etiladi (XSS himoyasi)", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const type = await makeEquipment("Monoblok", { warehouseQty: 10 });

    const res = await transferBatchToUsta(
      usta.id,
      [{ equipmentId: type.id, quantity: 1 }],
      "izoh",
      "WITH_DOC",
      "javascript:alert(1)",
    );

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(10);
  });
});

describe("assignEquipmentToClient (mijozga o'rnatish)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ombordan mijozga — qoldiq ayiriladi, manba WAREHOUSE deb yoziladi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const client = await makeClient();
    const type = await makeEquipment("Monoblok", { warehouseQty: 5 });

    const res = await assignEquipmentToClient(client.id, type.id, "RENTAL", 2);

    expect(res.ok).toBe(true);
    expect(await stockOf(type.id)).toBe(3);
    const ce = await db.clientEquipment.findFirst({ where: { clientId: client.id } });
    expect(ce!.quantity).toBe(2);
    expect(ce!.ownership).toBe("RENTAL");
    const mv = await db.equipmentMovement.findFirst({ where: { toType: "CLIENT" } });
    expect(mv!.fromType, "manba kesimi analitika uchun muhim").toBe("WAREHOUSE");
  });

  it("usta zaxirasidan mijozga — manba USTA deb yoziladi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const usta = await makeUser("INSTALLER");
    const client = await makeClient();
    const type = await makeEquipment("Monoblok", { warehouseQty: 5 });
    await transferToUsta(type.id, usta.id, 3, "ustaga");

    const res = await assignEquipmentToClient(client.id, type.id, "RENTAL", 2, {
      type: "USTA",
      ustaId: usta.id,
    });

    expect(res.ok).toBe(true);
    expect(await stockOf(type.id, "USTA", usta.id)).toBe(1);
    expect(await stockOf(type.id), "ombor tegilmasligi kerak").toBe(2);
    const mv = await db.equipmentMovement.findFirst({
      where: { toType: "CLIENT" },
      orderBy: { createdAt: "desc" },
    });
    expect(mv!.fromType).toBe("USTA");
    expect(mv!.fromId).toBe(usta.id);
  });

  it("manbada yetarli bo'lmasa — mijozga ham yozilmaydi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const client = await makeClient();
    const type = await makeEquipment("Monoblok", { warehouseQty: 1 });

    const res = await assignEquipmentToClient(client.id, type.id, "RENTAL", 5);

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(1);
    expect(await db.clientEquipment.count()).toBe(0);
  });

  it("ijara biriktirilgach mijozning equipmentMode RENTAL bo'ladi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const client = await makeClient();
    const type = await makeEquipment("Monoblok", { warehouseQty: 5 });

    await assignEquipmentToClient(client.id, type.id, "RENTAL", 1);

    const after = await db.client.findUnique({ where: { id: client.id } });
    expect(after!.equipmentMode).toBe("RENTAL");
  });

  it("sotuvda bir martalik to'lov yoziladi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const client = await makeClient({ currency: "USD" });
    const type = await makeEquipment("Monoblok", { warehouseQty: 5, salePrice: 250 });

    await assignEquipmentToClient(client.id, type.id, "SOLD", 2);

    const pay = await db.payment.findFirst({ where: { clientId: client.id } });
    expect(pay, "sotuvda to'lov yozilishi kerak").not.toBeNull();
    expect(pay!.amount).toBe(500); // 250 x 2
  });

  it("OPERATOR uskuna biriktira olmaydi", async () => {
    await loginAs(await makeUser("OPERATOR"));
    const client = await makeClient();
    const type = await makeEquipment("Monoblok", { warehouseQty: 5 });

    const res = await assignEquipmentToClient(client.id, type.id, "RENTAL", 1);

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(5);
  });
});

describe("scrapToBrak (brakka chiqarish)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ombordan brakka — qoldiq ko'chadi, yo'qolmaydi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const type = await makeEquipment("Monoblok", { warehouseQty: 5 });

    const res = await scrapToBrak(type.id, "WAREHOUSE", "WAREHOUSE", 2, "singan");

    expect(res.ok).toBe(true);
    expect(await stockOf(type.id)).toBe(3);
    expect(await stockOf(type.id, "BRAK", "BRAK")).toBe(2);
  });

  it("izohsiz brakka chiqarib bo'lmaydi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const type = await makeEquipment("Monoblok", { warehouseQty: 5 });

    const res = await scrapToBrak(type.id, "WAREHOUSE", "WAREHOUSE", 1, "");

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(5);
  });

  it("yetarli bo'lmasa — o'zgarmaydi", async () => {
    await loginAs(await makeUser("MANAGER"));
    const type = await makeEquipment("Monoblok", { warehouseQty: 1 });

    const res = await scrapToBrak(type.id, "WAREHOUSE", "WAREHOUSE", 5, "singan");

    expect(res.ok).toBe(false);
    expect(await stockOf(type.id)).toBe(1);
  });
});

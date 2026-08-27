import { describe, it, expect } from "vitest";
import { buildEquipmentQtyMaps, sumMrrByCurrency, INCOMPLETE_WHERE } from "./problem-clients";

describe("buildEquipmentQtyMaps", () => {
  it("RENTAL va boshqa egalik turlarini alohida to'playdi", () => {
    const { rented, soldQty } = buildEquipmentQtyMaps([
      { clientId: "c1", quantity: 2, ownership: "RENTAL" },
      { clientId: "c1", quantity: 1, ownership: "SOLD" },
      { clientId: "c2", quantity: 3, ownership: "SOLD" },
    ]);
    expect(rented.get("c1")).toBe(2);
    expect(rented.get("c2")).toBeUndefined();
    expect(soldQty.get("c1")).toBe(1);
    expect(soldQty.get("c2")).toBe(3);
  });

  it("bitta mijoz uchun bir nechta yozuv yig'iladi", () => {
    const { rented } = buildEquipmentQtyMaps([
      { clientId: "c1", quantity: 1, ownership: "RENTAL" },
      { clientId: "c1", quantity: 2, ownership: "RENTAL" },
    ]);
    expect(rented.get("c1")).toBe(3);
  });

  it("bo'sh ro'yxat — bo'sh xaritalar", () => {
    const { rented, soldQty } = buildEquipmentQtyMaps([]);
    expect(rented.size).toBe(0);
    expect(soldQty.size).toBe(0);
  });
});

describe("sumMrrByCurrency", () => {
  it("valyuta bo'yicha alohida yig'indi, birlashtirilmaydi", () => {
    const mrr = sumMrrByCurrency([
      { currency: "USD", monthlyAmount: 30 },
      { currency: "USD", monthlyAmount: 20 },
      { currency: "UZS", monthlyAmount: 500000 },
    ]);
    expect(mrr).toEqual({ USD: 50, UZS: 500000 });
  });

  it("bo'sh ro'yxat — bo'sh obyekt", () => {
    expect(sumMrrByCurrency([])).toEqual({});
  });
});

describe("INCOMPLETE_WHERE", () => {
  it("bo'sh telefon, restoran nomi, '—' va viloyatsizlikni qamraydi", () => {
    const or = INCOMPLETE_WHERE.OR as Record<string, unknown>[];
    expect(or).toContainEqual({ phone: "" });
    expect(or).toContainEqual({ restaurantName: "" });
    expect(or).toContainEqual({ restaurantName: "—" });
    expect(or).toContainEqual({ region: null });
    expect(or).toContainEqual({ region: "" });
  });
});

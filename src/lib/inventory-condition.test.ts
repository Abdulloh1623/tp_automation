import { describe, it, expect } from "vitest";
import {
  splitUstaStockByCondition,
  sumSplits,
  type MovementAgg,
  type StockRow,
} from "./inventory-condition";

const U = "usta1";
const T = "type1";

const mv = (
  fromType: string | null,
  fromId: string | null,
  toType: string | null,
  toId: string | null,
  quantity: number,
): MovementAgg => ({ fromType, fromId, toType, toId, equipmentTypeId: T, quantity });

const stock = (quantity: number): StockRow[] => [
  { locationId: U, equipmentTypeId: T, quantity },
];

const get = (m: Map<string, ReturnType<typeof sumSplits>>) => m.get(`${U}|${T}`)!;

describe("splitUstaStockByCondition", () => {
  it("ombordan olingan — yangi", () => {
    const r = get(splitUstaStockByCondition(stock(5), [mv("WAREHOUSE", "WAREHOUSE", "USTA", U, 5)]));
    expect(r).toEqual({ total: 5, fresh: 5, used: 0, unknown: 0 });
  });

  it("mijozdan qaytarib olingan — ishlatilgan", () => {
    const r = get(splitUstaStockByCondition(stock(3), [mv("CLIENT", "c1", "USTA", U, 3)]));
    expect(r).toEqual({ total: 3, fresh: 0, used: 3, unknown: 0 });
  });

  it("aralash: 5 yangi olib, 2 tasini o'rnatgan, 1 ta mijozdan qaytargan", () => {
    const r = get(
      splitUstaStockByCondition(stock(4), [
        mv("WAREHOUSE", "WAREHOUSE", "USTA", U, 5),
        mv("USTA", U, "CLIENT", "c1", 2),
        mv("CLIENT", "c2", "USTA", U, 1),
      ]),
    );
    expect(r).toEqual({ total: 4, fresh: 3, used: 1, unknown: 0 });
  });

  it("omborga topshirgani ishlatilganidan ayiriladi", () => {
    const r = get(
      splitUstaStockByCondition(stock(1), [
        mv("CLIENT", "c1", "USTA", U, 3),
        mv("USTA", U, "WAREHOUSE", "WAREHOUSE", 2),
      ]),
    );
    expect(r).toEqual({ total: 1, fresh: 0, used: 1, unknown: 0 });
  });

  it("jurnalda iz yo'q (tarixiy qoldiq) — aniqlanmagan", () => {
    const r = get(splitUstaStockByCondition(stock(7), []));
    expect(r).toEqual({ total: 7, fresh: 0, used: 0, unknown: 7 });
  });

  it("jurnal qoldiqdan oshsa — avval ishlatilgani kamayadi, jami mos qoladi", () => {
    const r = get(
      splitUstaStockByCondition(stock(2), [
        mv("WAREHOUSE", "WAREHOUSE", "USTA", U, 3),
        mv("CLIENT", "c1", "USTA", U, 3),
      ]),
    );
    expect(r.total).toBe(2);
    expect(r.fresh + r.used + r.unknown).toBe(2);
    expect(r.fresh).toBe(2); // ishlatilgani (3) to'liq qirqildi, yangisi qoldi
    expect(r.used).toBe(0);
  });

  it("manfiy qoldiqqa tushmaydi", () => {
    const r = get(
      splitUstaStockByCondition(stock(0), [mv("USTA", U, "CLIENT", "c1", 5)]),
    );
    expect(r).toEqual({ total: 0, fresh: 0, used: 0, unknown: 0 });
  });

  it("boshqa ustaning harakati ta'sir qilmaydi", () => {
    const r = get(
      splitUstaStockByCondition(stock(2), [
        mv("WAREHOUSE", "WAREHOUSE", "USTA", "usta2", 9),
        mv("WAREHOUSE", "WAREHOUSE", "USTA", U, 2),
      ]),
    );
    expect(r).toEqual({ total: 2, fresh: 2, used: 0, unknown: 0 });
  });
});

describe("sumSplits", () => {
  it("turlar bo'yicha jamlaydi", () => {
    expect(
      sumSplits([
        { total: 3, fresh: 2, used: 1, unknown: 0 },
        { total: 4, fresh: 0, used: 3, unknown: 1 },
      ]),
    ).toEqual({ total: 7, fresh: 2, used: 4, unknown: 1 });
  });

  it("bo'sh ro'yxat — nol", () => {
    expect(sumSplits([])).toEqual({ total: 0, fresh: 0, used: 0, unknown: 0 });
  });
});

import { describe, it, expect } from "vitest";
import { parseCsvWithHeader, aoaToParsed } from "./csv";

describe("parseCsvWithHeader", () => {
  it("sarlavha va qatorlarni ajratadi", () => {
    const p = parseCsvWithHeader("FIO,Telefon\nAli,998901112233\nVali,998907654321");
    expect(p.headers).toEqual(["FIO", "Telefon"]);
    expect(p.rows).toHaveLength(2);
    expect(p.lines).toEqual([2, 3]);
  });
});

describe("aoaToParsed (Excel varag'i)", () => {
  it("sarlavha + qatorlar, Excel qator raqamlari bilan", () => {
    const p = aoaToParsed([
      ["FIO", "Telefon", "Viloyat"],
      ["Ali", "998901112233", "Toshkent"],
      ["Vali", "998907654321", "Andijon"],
    ]);
    expect(p.headers).toEqual(["FIO", "Telefon", "Viloyat"]);
    expect(p.rows).toEqual([
      ["Ali", "998901112233", "Toshkent"],
      ["Vali", "998907654321", "Andijon"],
    ]);
    expect(p.lines).toEqual([2, 3]);
  });

  it("to'liq bo'sh qatorlarni tashlaydi (raqamlash saqlanadi)", () => {
    const p = aoaToParsed([
      ["FIO", "Tel"],
      ["Ali", "99890"],
      ["", ""],
      ["Vali", "99891"],
    ]);
    expect(p.rows).toHaveLength(2);
    expect(p.lines).toEqual([2, 4]); // bo'sh 3-qator tashlab yuborildi
  });

  it("kalta qatorlarni bo'sh katak bilan to'ldiradi, ortiqchasini kesadi", () => {
    const p = aoaToParsed([
      ["A", "B", "C"],
      ["1"],
      ["1", "2", "3", "4"],
    ]);
    expect(p.rows[0]).toEqual(["1", "", ""]);
    expect(p.rows[1]).toEqual(["1", "2", "3"]);
  });

  it("sarlavha oxiridagi bo'sh ustunlar qisqartiriladi", () => {
    const p = aoaToParsed([
      ["FIO", "Tel", "", ""],
      ["Ali", "99890", "x", ""],
    ]);
    expect(p.headers).toEqual(["FIO", "Tel"]);
    expect(p.rows[0]).toEqual(["Ali", "99890"]);
  });

  it("raqam/null kataklar matnga aylanadi", () => {
    const p = aoaToParsed([
      ["FIO", "Summa"],
      ["Ali", 46146],
      [null, undefined],
    ]);
    expect(p.rows[0]).toEqual(["Ali", "46146"]);
    expect(p.rows).toHaveLength(1); // null-qator bo'sh sanaladi
  });

  it("tepadagi bo'sh qatorlar tashlanadi — sarlavha birinchi to'liq qator", () => {
    const p = aoaToParsed([
      ["", ""],
      [null, undefined],
      ["FIO", "Tel"],
      ["Ali", "99890"],
    ]);
    expect(p.headers).toEqual(["FIO", "Tel"]);
    expect(p.rows).toEqual([["Ali", "99890"]]);
    expect(p.lines).toEqual([4]); // Excel'dagi haqiqiy qator
  });

  it("bo'sh kirish — bo'sh natija", () => {
    expect(aoaToParsed([])).toEqual({ headers: [], rows: [], lines: [] });
    expect(aoaToParsed([["", ""], [""]])).toEqual({ headers: [], rows: [], lines: [] });
  });
});

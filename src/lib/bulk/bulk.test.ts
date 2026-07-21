import { describe, it, expect } from "vitest";
import { ENTITIES, ENTITY_KEYS, isBulkEntity, templateFileName } from "./entities";
import {
  mapHeaders,
  parseRows,
  normHeader,
  parseAmount,
  parseDate,
  phoneKey,
  hasClientLookup,
  isExampleRow,
} from "./parse";

describe("ENTITIES ta'riflari", () => {
  it("to'rtta tur bor", () => {
    expect(ENTITY_KEYS.sort()).toEqual(["mijozlar", "tolovlar", "uskuna", "xodimlar"]);
  });

  it("har bir turda majburiy ustun va izohlar bor", () => {
    for (const key of ENTITY_KEYS) {
      const def = ENTITIES[key];
      expect(def.columns.length, key).toBeGreaterThan(0);
      expect(def.notes.length, key).toBeGreaterThan(0);
      expect(def.sheetName, key).toBeTruthy();
    }
  });

  it("ustun kalitlari takrorlanmaydi", () => {
    for (const key of ENTITY_KEYS) {
      const keys = ENTITIES[key].columns.map((c) => c.key);
      expect(new Set(keys).size, key).toBe(keys.length);
    }
  });

  it("ustun yorliqlari takrorlanmaydi (sarlavha moslash uchun muhim)", () => {
    for (const key of ENTITY_KEYS) {
      const labels = ENTITIES[key].columns.map((c) => normHeader(c.label));
      expect(new Set(labels).size, key).toBe(labels.length);
    }
  });

  it("xodimlar shablonida PAROL ustuni YO'Q", () => {
    const keys = ENTITIES.xodimlar.columns.map((c) => c.key.toLowerCase());
    expect(keys.some((k) => k.includes("parol") || k.includes("password"))).toBe(false);
  });

  it("isBulkEntity prototip kalitlarini rad etadi", () => {
    expect(isBulkEntity("mijozlar")).toBe(true);
    expect(isBulkEntity("constructor")).toBe(false);
    expect(isBulkEntity("__proto__")).toBe(false);
    expect(isBulkEntity("yoq")).toBe(false);
  });

  it("fayl nomi turga bog'liq", () => {
    expect(templateFileName("tolovlar")).toBe("TP-shablon-tolovlar.xlsx");
  });
});

describe("normHeader", () => {
  it("majburiylik belgisini (*) olib tashlaydi — shablon qaytib kelganda muhim", () => {
    expect(normHeader("FIO *")).toBe(normHeader("FIO"));
    expect(normHeader("Summa*")).toBe(normHeader("Summa"));
    expect(normHeader("Soni  **  ")).toBe(normHeader("Soni"));
  });

  it("registr, bo'shliq va apostroflarni normallashtiradi", () => {
    expect(normHeader("  To'lov  Sanasi ")).toBe(normHeader("to'lov sanasi"));
    expect(normHeader("Toʻlov sanasi")).toBe(normHeader("To'lov sanasi"));
    expect(normHeader("To`lov sanasi")).toBe(normHeader("To'lov sanasi"));
  });
});

describe("mapHeaders", () => {
  const def = ENTITIES.tolovlar;

  it("ustunlar joyi almashsa ham topadi", () => {
    const h = mapHeaders(def, ["Summa", "To'lov sanasi", "Mijoz telefoni"]);
    expect(h.index.amount).toBe(0);
    expect(h.index.paidAt).toBe(1);
    expect(h.index.clientPhone).toBe(2);
    expect(h.missingRequired).toEqual([]);
  });

  it("majburiy ustun yo'q bo'lsa aytadi", () => {
    const h = mapHeaders(def, ["Mijoz telefoni", "Izoh"]);
    expect(h.missingRequired).toContain("Summa");
    expect(h.missingRequired).toContain("To'lov sanasi");
  });

  it("notanish ustunlar alohida qaytadi va xato hisoblanmaydi", () => {
    const h = mapHeaders(def, ["Summa", "To'lov sanasi", "Menejer izohi"]);
    expect(h.unknown).toEqual(["Menejer izohi"]);
    expect(h.missingRequired).toEqual([]);
  });
});

describe("parseRows", () => {
  const def = ENTITIES.tolovlar;
  const header = ["Mijoz telefoni", "Shartnoma raqami", "Restoran nomi", "Summa", "Valyuta", "To'lov sanasi", "To'lov usuli", "Izoh"];

  it("oddiy qatorlarni o'qiydi", () => {
    const { rows } = parseRows(def, [
      header,
      ["998901112233", "", "", "29", "USD", "2026-07-15", "Karta", "iyul"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].values.clientPhone).toBe("998901112233");
    expect(rows[0].values.amount).toBe("29");
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].line).toBe(2);
  });

  it("majburiy maydon bo'sh bo'lsa xato yoziladi, qator tashlanmaydi", () => {
    const { rows } = parseRows(def, [header, ["998901112233", "", "", "", "USD", "", "", ""]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].errors.join(" ")).toContain("Summa");
    expect(rows[0].errors.join(" ")).toContain("To'lov sanasi");
  });

  it("butunlay bo'sh qatorlar o'tkazib yuboriladi", () => {
    const { rows } = parseRows(def, [
      header,
      ["", "", "", "", "", "", "", ""],
      ["998901112233", "", "", "29", "", "2026-07-15", "", ""],
      ["", "", "", "", "", "", "", ""],
    ]);
    expect(rows).toHaveLength(1);
  });

  it("shablondagi namuna qatori tashlanadi", () => {
    const example = def.columns.map((c) => c.example);
    const { rows } = parseRows(def, [def.columns.map((c) => c.label), example]);
    expect(rows).toHaveLength(0);
  });

  it("Excel Date qiymatini YYYY-MM-DD ga keltiradi", () => {
    const { rows } = parseRows(def, [
      header,
      ["998901112233", "", "", "29", "", new Date(2026, 6, 15), "", ""],
    ]);
    expect(rows[0].values.paidAt).toBe("2026-07-15");
  });

  it("Excel sonini matnga keltiradi", () => {
    const { rows } = parseRows(def, [header, ["998901112233", "", "", 29, "", "2026-07-15", "", ""]]);
    expect(rows[0].values.amount).toBe("29");
  });

  it("bo'sh jadval — majburiy ustunlar yo'q deb belgilanadi", () => {
    const { rows, headers } = parseRows(def, []);
    expect(rows).toEqual([]);
    expect(headers.missingRequired.length).toBeGreaterThan(0);
  });
});

describe("shablon sarlavhasi bilan moslik (regressiya)", () => {
  it("majburiy ustunlar ' *' bilan yozilgan bo'lsa ham tanilaydi", () => {
    for (const key of ENTITY_KEYS) {
      const def = ENTITIES[key];
      // buildTemplate aynan shunday sarlavha yozadi
      const header = def.columns.map((c) => (c.required ? `${c.label} *` : c.label));
      const h = mapHeaders(def, header);
      expect(h.missingRequired, key).toEqual([]);
      expect(h.unknown, key).toEqual([]);
    }
  });

  it("shablon sarlavhasi + namuna qatori — hech qanday qator qolmaydi", () => {
    for (const key of ENTITY_KEYS) {
      const def = ENTITIES[key];
      const header = def.columns.map((c) => (c.required ? `${c.label} *` : c.label));
      const example = def.columns.map((c) => c.example);
      const { rows } = parseRows(def, [header, example]);
      expect(rows, key).toHaveLength(0);
    }
  });
});

describe("isExampleRow", () => {
  it("namuna qatorini taniydi", () => {
    const def = ENTITIES.uskuna;
    const values = Object.fromEntries(def.columns.map((c) => [c.key, c.example]));
    expect(isExampleRow(def, values)).toBe(true);
  });
  it("haqiqiy ma'lumotni namuna deb hisoblamaydi", () => {
    const def = ENTITIES.uskuna;
    const values = Object.fromEntries(def.columns.map((c) => [c.key, c.example]));
    values.quantity = "7";
    expect(isExampleRow(def, values)).toBe(false);
  });
});

describe("parseAmount", () => {
  it("oddiy son", () => {
    expect(parseAmount("29")).toBe(29);
    expect(parseAmount("29.5")).toBe(29.5);
  });
  it("bo'shliq va vergul bilan", () => {
    expect(parseAmount("350 000")).toBe(350000);
    expect(parseAmount("1,5")).toBe(1.5);
  });
  it("yaroqsiz qiymat", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("29$")).toBeNull();
  });
});

describe("parseDate", () => {
  it("YYYY-MM-DD", () => {
    const d = parseDate("2026-07-15")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(15);
  });
  it("DD.MM.YYYY va DD/MM/YYYY", () => {
    expect(parseDate("15.07.2026")!.getMonth()).toBe(6);
    expect(parseDate("15/07/2026")!.getDate()).toBe(15);
  });
  it("yaroqsiz", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("15 iyul")).toBeNull();
    expect(parseDate("2026-13-40")).not.toBeNull(); // JS Date siljitadi — bu ataylab qabul qilinadi
  });
});

describe("phoneKey", () => {
  it("oxirgi 9 raqam", () => {
    expect(phoneKey("+998 90 111 22 33")).toBe("901112233");
    expect(phoneKey("901112233")).toBe("901112233");
  });
  it("turli formatlar bir xil kalitga tushadi", () => {
    expect(phoneKey("998901112233")).toBe(phoneKey("+998-90-111-22-33"));
  });
});

describe("hasClientLookup", () => {
  it("kamida bitta identifikator kerak", () => {
    expect(hasClientLookup({ clientPhone: "998901112233" })).toBe(true);
    expect(hasClientLookup({ clientContract: "TP-1" })).toBe(true);
    expect(hasClientLookup({ clientName: "Kafe" })).toBe(true);
    expect(hasClientLookup({ clientPhone: "", clientContract: "", clientName: "" })).toBe(false);
    expect(hasClientLookup({})).toBe(false);
  });
});

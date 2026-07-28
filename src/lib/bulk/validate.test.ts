import { describe, it, expect } from "vitest";
import {
  resolveClient,
  resolvePayment,
  resolveEquipment,
  resolveStaff,
  generatePassword,
  type Lookups,
} from "./validate";
import type { ParsedRow } from "./parse";

const lk = (over: Partial<Lookups> = {}): Lookups => ({
  byPhone: new Map([["901112233", "c1"]]),
  byContract: new Map([["tp-104", "c2"]]),
  byName: new Map([
    ["chaykhana", "c3"],
    ["takror", null], // bir nechta mos keladi
  ]),
  equipmentTypes: new Map([["monoblok", "t1"], ["printer", "t2"]]),
  usernames: new Set(["admin"]),
  clientCurrency: new Map([["c1", "UZS"], ["c2", "USD"]]),
  ...over,
});

const row = (values: Record<string, string>, errors: string[] = []): ParsedRow => ({
  line: 2,
  values: {
    clientPhone: "", clientContract: "", clientName: "",
    amount: "", currency: "", paidAt: "", method: "", note: "",
    equipmentType: "", quantity: "", ownership: "",
    name: "", username: "", role: "", phone: "", regions: "", shift: "", dailyLeadTarget: "",
    ...values,
  },
  errors,
});

describe("resolveClient", () => {
  it("shartnoma raqami bo'yicha", () => {
    const r = resolveClient({ clientContract: "TP-104" }, lk());
    expect(r).toEqual({ ok: true, id: "c2" });
  });

  it("telefon bo'yicha (format farqi muhim emas)", () => {
    expect(resolveClient({ clientPhone: "+998 90 111 22 33" }, lk())).toEqual({ ok: true, id: "c1" });
  });

  it("restoran nomi bo'yicha", () => {
    expect(resolveClient({ clientName: "Chaykhana" }, lk())).toEqual({ ok: true, id: "c3" });
  });

  it("shartnoma telefondan USTUN (eng ishonchli)", () => {
    const r = resolveClient({ clientContract: "TP-104", clientPhone: "901112233" }, lk());
    expect(r).toEqual({ ok: true, id: "c2" });
  });

  it("bir nechta mos kelgan nom — aniq xato", () => {
    const r = resolveClient({ clientName: "Takror" }, lk());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("bir nechta");
  });

  it("hech narsa berilmagan", () => {
    const r = resolveClient({}, lk());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("ko'rsatilmagan");
  });

  it("topilmadi", () => {
    const r = resolveClient({ clientPhone: "999999999" }, lk());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("topilmadi");
  });
});

describe("resolvePayment", () => {
  it("to'g'ri qator", () => {
    const r = resolvePayment(row({ clientContract: "TP-104", amount: "29", paidAt: "2026-07-15", method: "Karta" }), lk());
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.record.amount).toBe(29);
      expect(r.record.currency).toBe("USD");
      expect(r.record.method).toBe("Karta");
      expect(r.record.paidAt.getMonth()).toBe(6);
    }
  });

  it("valyuta bo'sh bo'lsa mijozniki olinadi", () => {
    const r = resolvePayment(row({ clientPhone: "901112233", amount: "350000", paidAt: "2026-07-15" }), lk());
    expect(r.status === "ok" && r.record.currency).toBe("UZS");
  });

  it("summa 0 yoki manfiy — xato", () => {
    expect(resolvePayment(row({ clientContract: "TP-104", amount: "0", paidAt: "2026-07-15" }), lk()).status).toBe("error");
    expect(resolvePayment(row({ clientContract: "TP-104", amount: "-5", paidAt: "2026-07-15" }), lk()).status).toBe("error");
  });

  it("summa matn bo'lsa — tushunarli xato", () => {
    const r = resolvePayment(row({ clientContract: "TP-104", amount: "yigirma", paidAt: "2026-07-15" }), lk());
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("Summa");
  });

  it("sana noto'g'ri", () => {
    const r = resolvePayment(row({ clientContract: "TP-104", amount: "29", paidAt: "15 iyul" }), lk());
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("Sana");
  });

  it("valyuta noto'g'ri", () => {
    const r = resolvePayment(row({ clientContract: "TP-104", amount: "29", paidAt: "2026-07-15", currency: "EUR" }), lk());
    expect(r.status).toBe("error");
  });

  it("to'lov usuli noto'g'ri", () => {
    const r = resolvePayment(row({ clientContract: "TP-104", amount: "29", paidAt: "2026-07-15", method: "naqd" }), lk());
    expect(r.status).toBe("error");
  });

  it("prototip kaliti to'lov usuli sifatida o'tmaydi", () => {
    const r = resolvePayment(row({ clientContract: "TP-104", amount: "29", paidAt: "2026-07-15", method: "constructor" }), lk());
    expect(r.status).toBe("error");
  });

  it("o'qishdagi xato saqlanadi", () => {
    const r = resolvePayment(row({ clientContract: "TP-104" }, ['"Summa" bo\'sh']), lk());
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("Summa");
  });
});

describe("resolveEquipment", () => {
  it("to'g'ri qator", () => {
    const r = resolveEquipment(row({ clientContract: "TP-104", equipmentType: "Monoblok", quantity: "2", ownership: "ijara" }), lk());
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.record.equipmentTypeId).toBe("t1");
      expect(r.record.quantity).toBe(2);
      expect(r.record.ownership).toBe("RENTAL");
    }
  });

  it("egaligi bo'sh bo'lsa — ijara", () => {
    const r = resolveEquipment(row({ clientContract: "TP-104", equipmentType: "Printer", quantity: "1" }), lk());
    expect(r.status === "ok" && r.record.ownership).toBe("RENTAL");
  });

  it("0 — o'chirish deb belgilanadi", () => {
    const r = resolveEquipment(row({ clientContract: "TP-104", equipmentType: "Monoblok", quantity: "0" }), lk());
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.note).toContain("o'chiriladi");
  });

  it("noma'lum texnika turi — aniq xato", () => {
    const r = resolveEquipment(row({ clientContract: "TP-104", equipmentType: "Skaner", quantity: "1" }), lk());
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("Skaner");
  });

  it("kasr yoki manfiy son — xato", () => {
    expect(resolveEquipment(row({ clientContract: "TP-104", equipmentType: "Monoblok", quantity: "1.5" }), lk()).status).toBe("error");
    expect(resolveEquipment(row({ clientContract: "TP-104", equipmentType: "Monoblok", quantity: "-1" }), lk()).status).toBe("error");
  });

  it("egaligi noto'g'ri", () => {
    const r = resolveEquipment(row({ clientContract: "TP-104", equipmentType: "Monoblok", quantity: "1", ownership: "qarz" }), lk());
    expect(r.status).toBe("error");
  });
});

describe("resolveStaff", () => {
  it("operator qo'shiladi", () => {
    const r = resolveStaff(row({ name: "Asadbek", username: "asadbek", role: "OPERATOR" }), lk(), new Set());
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.record.role).toBe("OPERATOR");
      expect(r.record.username).toBe("asadbek");
      expect(r.record.dailyLeadTarget).toBeNull(); // bo'sh ustun = avtomatik
      expect(r.record.shift).toBe("DAY");
    }
  });

  it("usta uchun login SHART EMAS", () => {
    const r = resolveStaff(row({ name: "Aziz usta", role: "usta" }), lk(), new Set());
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.record.role).toBe("INSTALLER");
      expect(r.record.username).toBeNull();
    }
  });

  it("usta bo'lmaganga login shart", () => {
    const r = resolveStaff(row({ name: "X", role: "OPERATOR" }), lk(), new Set());
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("Login");
  });

  it("band login — o'tkazib yuboriladi (mavjud xodim o'zgarmaydi)", () => {
    const r = resolveStaff(row({ name: "X", username: "admin", role: "OPERATOR" }), lk(), new Set());
    expect(r.status).toBe("skip");
  });

  it("fayl ichida takrorlangan login — o'tkazib yuboriladi", () => {
    const seen = new Set<string>();
    expect(resolveStaff(row({ name: "A", username: "yangi", role: "OPERATOR" }), lk(), seen).status).toBe("ok");
    expect(resolveStaff(row({ name: "B", username: "yangi", role: "OPERATOR" }), lk(), seen).status).toBe("skip");
  });

  it("login formati noto'g'ri", () => {
    const r = resolveStaff(row({ name: "X", username: "ab", role: "OPERATOR" }), lk(), new Set());
    expect(r.status).toBe("error");
  });

  it("rol noto'g'ri", () => {
    const r = resolveStaff(row({ name: "X", username: "xyz", role: "direktor" }), lk(), new Set());
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("Rol");
  });

  it("viloyatlar vergul bilan ajratiladi", () => {
    const r = resolveStaff(
      row({ name: "X", username: "xyz", role: "OPERATOR", regions: "Toshkent shahri, Samarqand ,, Buxoro" }),
      lk(), new Set(),
    );
    expect(r.status === "ok" && r.record.regions).toEqual(["Toshkent shahri", "Samarqand", "Buxoro"]);
  });

  it("smena NIGHT", () => {
    const r = resolveStaff(row({ name: "X", username: "xyz", role: "OPERATOR", shift: "night" }), lk(), new Set());
    expect(r.status === "ok" && r.record.shift).toBe("NIGHT");
  });
});

describe("generatePassword", () => {
  it("12 belgi", () => {
    expect(generatePassword().length).toBe(12);
  });

  it("chalkashadigan belgilar yo'q (0 O 1 l I)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it("parol minimumidan uzun", () => {
    expect(generatePassword().length).toBeGreaterThanOrEqual(8);
  });

  it("har safar boshqacha", () => {
    const set = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(set.size).toBe(20);
  });
});

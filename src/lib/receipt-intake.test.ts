import { describe, it, expect } from "vitest";
import {
  parseReceiptText,
  matchClientByPhone,
  phoneKey,
  type ClientCandidate,
} from "./receipt-intake";

// "To'lov cheklari" guruhidan olingan HAQIQIY namunalar
const SAMPLE_A = `Bilol
Nortojiyev Faxriddin (Sergeli Food city, Mobina kafe)
90 965 65 89
187 raqam`;

const SAMPLE_B = `Oktam Jo'rayev (Sanjarbek), Namangan viloyati chortoq tumani
Tel:90 796 66 76
100-raqam`;

describe("parseReceiptText", () => {
  it("namuna A: yuboruvchi qatorini o'tkazib, mijoz qatorini oladi", () => {
    const r = parseReceiptText(SAMPLE_A);
    expect(r.phones).toEqual(["909656589"]);
    expect(r.sheetNo).toBe("187");
    expect(r.name).toBe("Nortojiyev Faxriddin (Sergeli Food city, Mobina kafe)");
  });

  it("namuna B: 'Tel:' prefiksi va '100-raqam' shakli", () => {
    const r = parseReceiptText(SAMPLE_B);
    expect(r.phones).toEqual(["907966676"]);
    expect(r.sheetNo).toBe("100");
    expect(r.name).toBe("Oktam Jo'rayev (Sanjarbek), Namangan viloyati chortoq tumani");
  });

  it("+998 prefiksli raqamni oxirgi 9 raqamga keltiradi", () => {
    expect(parseReceiptText("Mijoz\n+998 90 965 65 89").phones).toEqual(["909656589"]);
  });

  it("summa qatorini telefon deb o'ylamaydi", () => {
    const r = parseReceiptText("Mijoz nomi\n349 000 so'm\n90 965 65 89");
    expect(r.phones).toEqual(["909656589"]);
  });

  it("telefon yo'q bo'lsa bo'sh ro'yxat qaytaradi", () => {
    const r = parseReceiptText("Faqat izoh matni");
    expect(r.phones).toEqual([]);
    expect(r.name).toBe("Faqat izoh matni");
  });

  it("bir nechta telefonni yig'adi va takrorlamaydi", () => {
    const r = parseReceiptText("Mijoz\n90 965 65 89\n+998909656589\n33 123 45 67");
    expect(r.phones).toEqual(["909656589", "331234567"]);
  });

  it("bo'sh matnda yiqilmaydi", () => {
    expect(parseReceiptText("")).toEqual({ name: null, phones: [], sheetNo: null });
  });
});

describe("phoneKey", () => {
  it("turli formatlarni bir kalitga keltiradi", () => {
    expect(phoneKey("+998 90 965 65 89")).toBe("909656589");
    expect(phoneKey("909656589")).toBe("909656589");
    expect(phoneKey("90-965-65-89")).toBe("909656589");
  });

  it("qisqa/bo'sh qiymatda bo'sh satr", () => {
    expect(phoneKey("187")).toBe("");
    expect(phoneKey(null)).toBe("");
  });
});

describe("matchClientByPhone", () => {
  const clients: ClientCandidate[] = [
    { id: "c1", phone: "+998909656589", extraPhones: [] },
    { id: "c2", phone: "+998331234567", extraPhones: ["+998907966676"] },
  ];

  it("asosiy telefon bo'yicha topadi", () => {
    const r = matchClientByPhone(parseReceiptText(SAMPLE_A), clients);
    expect(r).toEqual({ clientId: "c1", confidence: "exact", ambiguous: false });
  });

  it("qo'shimcha telefon (ClientPhone) bo'yicha ham topadi", () => {
    const r = matchClientByPhone(parseReceiptText(SAMPLE_B), clients);
    expect(r.clientId).toBe("c2");
  });

  it("topilmasa null qaytaradi", () => {
    const r = matchClientByPhone(parseReceiptText("Mijoz\n90 111 11 11"), clients);
    expect(r).toEqual({ clientId: null, confidence: "none", ambiguous: false });
  });

  it("bir raqam ikki mijozda bo'lsa avtomatik tanlamaydi", () => {
    const dup: ClientCandidate[] = [
      { id: "a", phone: "+998909656589", extraPhones: [] },
      { id: "b", phone: "909656589", extraPhones: [] },
    ];
    const r = matchClientByPhone(parseReceiptText(SAMPLE_A), dup);
    expect(r.clientId).toBeNull();
    expect(r.ambiguous).toBe(true);
  });

  it("telefon umuman yo'q bo'lsa taxmin qilmaydi", () => {
    const r = matchClientByPhone(parseReceiptText("Nortojiyev Faxriddin"), clients);
    expect(r.clientId).toBeNull();
  });
});

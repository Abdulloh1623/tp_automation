import { describe, it, expect } from "vitest";
import {
  parseReceiptText,
  matchClient,
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
    expect(parseReceiptText("")).toEqual({
      name: null,
      phones: [],
      sheetNo: null,
      contracts: [],
      lines: [],
    });
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

// Haqiqiy eksportdan olingan formatlar
const SAMPLE_CONTRACT = `Rahimov Rahimbek (Samarqand sh,K.Bekzod MFY)
AB130326158
Sheyx Karaoke bar`;

const SAMPLE_MULTIPHONE = `Bilol
Obidov Zohid (Eshonguzar)
Anor Baliq
90 153 22 43, 95 133 44 49
73-raqam`;

describe("parseReceiptText — haqiqiy eksport formatlari", () => {
  it("shartnoma raqamini ajratadi", () => {
    const r = parseReceiptText(SAMPLE_CONTRACT);
    expect(r.contracts).toEqual(["AB130326158"]);
  });

  // Ilgari BUZUQ edi: butun qatorning raqamlari sanalar edi (18 ta) va
  // hech bir telefon topilmasdi.
  it("bitta qatordagi IKKI telefonni ham topadi", () => {
    const r = parseReceiptText(SAMPLE_MULTIPHONE);
    expect(r.phones).toEqual(["901532243", "951334449"]);
  });

  it("bo'shliqli shartnoma raqamini normallashtiradi", () => {
    expect(parseReceiptText("Mijoz\nAB 080626").contracts).toEqual(["AB080626"]);
  });

  it("raqamsiz 'AB' ni shartnoma deb olmaydi", () => {
    expect(parseReceiptText("Mijoz\nAB").contracts).toEqual([]);
  });

  it("barcha qatorlarni saqlaydi (nom bo'yicha moslash uchun)", () => {
    expect(parseReceiptText(SAMPLE_CONTRACT).lines).toContain("Sheyx Karaoke bar");
  });

  it("'328 - raqam' shaklini ham tushunadi", () => {
    expect(parseReceiptText("Mijoz\n328 - raqam").sheetNo).toBe("328");
  });
});

describe("matchClient — kalitlar ishonchlilik tartibida", () => {
  const clients: ClientCandidate[] = [
    { id: "c1", phone: "+998909656589", extraPhones: [], restaurantName: "Anor Baliq", contractNumber: "AB111111" },
    { id: "c2", phone: "+998331234567", extraPhones: [], restaurantName: "ZGZ-FOOD", contractNumber: "AB130326158" },
  ];

  it("shartnoma raqami bo'yicha topadi (eng kuchli kalit)", () => {
    const r = matchClient(parseReceiptText(SAMPLE_CONTRACT), clients);
    expect(r).toEqual({ clientId: "c2", matchedBy: "contract", ambiguous: false });
  });

  it("telefon bo'yicha topadi", () => {
    const r = matchClient(parseReceiptText("Mijoz\n90 965 65 89"), clients);
    expect(r.clientId).toBe("c1");
    expect(r.matchedBy).toBe("phone");
  });

  it("restoran nomi bo'yicha topadi (eng zaif kalit)", () => {
    const r = matchClient(parseReceiptText("Obidov Zohid (Eshonguzar)\nAnor Baliq"), clients);
    expect(r.clientId).toBe("c1");
    expect(r.matchedBy).toBe("name");
  });

  it("shartnoma telefondan USTUN", () => {
    // Matnda c1 ning telefoni va c2 ning shartnomasi — shartnoma yutadi
    const r = matchClient(parseReceiptText("AB130326158\n90 965 65 89"), clients);
    expect(r.clientId).toBe("c2");
    expect(r.matchedBy).toBe("contract");
  });

  // --- Noaniqlik himoyasi: bularsiz noto'g'ri mijozga pul yozilardi ---

  it("bir xil nomli ikki mijozda avtomatik tanlamaydi", () => {
    const dup: ClientCandidate[] = [
      { id: "a", phone: "1", extraPhones: [], restaurantName: "Sulton kafe" },
      { id: "b", phone: "2", extraPhones: [], restaurantName: "Sulton kafe" },
    ];
    const r = matchClient(parseReceiptText("Sulton kafe"), dup);
    expect(r.clientId).toBeNull();
    expect(r.ambiguous).toBe(true);
  });

  // Bazada 98 ta mijozning restoran nomi BO'SH — bo'sh qator ular bilan
  // moslashsa, tasodifiy mijozga pul yozilardi.
  it("bo'sh restoran nomi bilan moslashmaydi", () => {
    const blanks: ClientCandidate[] = [
      { id: "a", phone: "1", extraPhones: [], restaurantName: "" },
      { id: "b", phone: "2", extraPhones: [], restaurantName: "   " },
    ];
    expect(matchClient(parseReceiptText("Mijoz\n\n"), blanks).clientId).toBeNull();
  });

  it("noaniq kalitdan keyin zaifroq kalitni sinaydi", () => {
    const mixed: ClientCandidate[] = [
      { id: "a", phone: "+998901112233", extraPhones: [], contractNumber: "AB999999", restaurantName: "X" },
      { id: "b", phone: "+998904445566", extraPhones: [], contractNumber: "AB999999", restaurantName: "Y" },
    ];
    // Shartnoma noaniq (ikkalasida bir xil), lekin telefon aniq → telefon yutadi
    const r = matchClient(parseReceiptText("AB999999\n90 111 22 33"), mixed);
    expect(r.clientId).toBe("a");
    expect(r.matchedBy).toBe("phone");
  });

  it("qisman mos kelgan nomni QABUL QILMAYDI", () => {
    const r = matchClient(parseReceiptText("Anor Baliq 2"), clients);
    expect(r.clientId).toBeNull();
  });

  it("hech narsa topilmasa null", () => {
    const r = matchClient(parseReceiptText("Umuman boshqa matn"), clients);
    expect(r).toEqual({ clientId: null, matchedBy: null, ambiguous: false });
  });
});

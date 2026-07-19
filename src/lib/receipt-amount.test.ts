import { describe, it, expect } from "vitest";
import { extractAmount } from "./receipt-amount";

// Guruhdagi HAQIQIY cheklardan olingan matn (OCR chiqishiga yaqin ko'rinishda)
const PAYNET = `paynet
STIR:
Operator: Пополнение UZCARD и HUMO
Xizmat turi: SOFTIX
Agent:
To'lov vaqti: 18.07.2026 11:20:40
Terminal raqami: 9132563
Chek raqami: 35858040717
Karta raqami: 5614 68** **** 2708
Karta turi: UZCARD
To'lov summasi: 339 806
Summa (mijozdan olinadigan): 350 000
Naqd: 10 195
Umumiy QQS qiymati: 0
Miqdori: 10 195
QQS summasi: 0 (0%)`;

const BANK_APP = `349 000 so'm
19-iyul, 2026 10:15
Operatsiya bajarildi
Chekni yuklab olish
Yuboruvchi: **** **** **** 4881
Qabul qiluvchi: **** **** **** 2708
Tranzaksiya raqami: 8890 2669860
Komissiya: 0 so'm
Summa: 349 000 so'm`;

describe("extractAmount — haqiqiy cheklar", () => {
  it("Paynet: yorliqli 'To'lov summasi' ni tanlaydi", () => {
    const r = extractAmount(PAYNET);
    expect(r.amount).toBe(339806);
    expect(r.confidence).toBe("high");
  });

  it("Paynet: ikkala summani ham nomzod sifatida saqlaydi", () => {
    const r = extractAmount(PAYNET);
    const values = r.candidates.map((c) => c.value);
    // Operator "mijozdan olinadigan" 350 000 ni ham tanlay olishi kerak
    expect(values).toContain(339806);
    expect(values).toContain(350000);
  });

  it("Paynet: chek/terminal/karta raqamlarini summa deb olmaydi", () => {
    const values = extractAmount(PAYNET).candidates.map((c) => c.value);
    expect(values).not.toContain(35858040717); // chek raqami
    expect(values).not.toContain(9132563); // terminal raqami
  });

  it("Paynet: QQS va komissiya qatorlarini o'tkazib yuboradi", () => {
    const labels = extractAmount(PAYNET).candidates.map((c) => c.label);
    expect(labels).not.toContain("QQS");
  });

  it("Bank ilovasi: summani va valyutani topadi", () => {
    const r = extractAmount(BANK_APP);
    expect(r.amount).toBe(349000);
    expect(r.currency).toBe("UZS");
  });

  it("Bank ilovasi: 0 so'mlik komissiyani tanlamaydi", () => {
    expect(extractAmount(BANK_APP).amount).not.toBe(0);
  });

  // Quyidagilar ilgari faqat TASODIFAN filtrlanardi (max chegaradan oshgani
  // uchun) — endi ataylab filtrlanadi, shuning uchun alohida test.
  it("tranzaksiya raqamini summa deb olmaydi", () => {
    const values = extractAmount(
      "Tranzaksiya raqami: 8890 2669860\nTo'lov summasi: 50 000",
      { max: 10_000_000_000 },
    ).candidates.map((c) => c.value);
    expect(values).toEqual([50000]);
  });

  it("niqoblangan karta raqamining oxirgi 4 raqamini summa deb olmaydi", () => {
    const values = extractAmount(
      "Yuboruvchi: **** **** **** 4881\nTo'lov summasi: 50 000",
    ).candidates.map((c) => c.value);
    expect(values).toEqual([50000]);
  });

  it("sana qatorini summa deb olmaydi", () => {
    const values = extractAmount(
      "To'lov vaqti: 18.07.2026 11:20:40\nSumma: 50 000",
    ).candidates.map((c) => c.value);
    expect(values).toEqual([50000]);
  });
});

describe("extractAmount — raqam formatlari", () => {
  it("bo'shliq bilan ajratilgan minglar", () => {
    expect(extractAmount("To'lov summasi: 1 234 567").amount).toBe(1234567);
  });

  it("kasr qismi (vergul)", () => {
    expect(extractAmount("Summa: 12 345,50").amount).toBe(12345.5);
  });

  it("nuqta bilan ajratilgan minglar (kasrsiz)", () => {
    expect(extractAmount("To'lov summasi: 1.234.567").amount).toBe(1234567);
  });

  it("apostrof bilan ajratilgan minglar", () => {
    expect(extractAmount("To'lov summasi: 1'234'567").amount).toBe(1234567);
  });
});

describe("extractAmount — chegara holatlar", () => {
  it("summa topilmasa none qaytaradi", () => {
    const r = extractAmount("Chek\nOperator: SOFTIX\nRahmat!");
    expect(r.amount).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.candidates).toEqual([]);
  });

  it("bo'sh matnda yiqilmaydi", () => {
    expect(extractAmount("")).toMatchObject({ amount: null, confidence: "none" });
  });

  it("yorliqsiz topilma 'low' ishonch beradi", () => {
    const r = extractAmount("349 000");
    expect(r.amount).toBe(349000);
    expect(r.confidence).toBe("low");
  });

  it("juda kichik raqamlarni (sana, foiz) qabul qilmaydi", () => {
    const r = extractAmount("18.07.2026\n0 (0%)\n30 kun");
    expect(r.amount).toBeNull();
  });

  it("vaqt qatorini summa deb olmaydi", () => {
    const values = extractAmount("11:20:40\nTo'lov summasi: 50 000").candidates.map(
      (c) => c.value,
    );
    expect(values).toEqual([50000]);
  });

  it("takrorlangan summani bir marta qaytaradi", () => {
    const r = extractAmount("To'lov summasi: 349 000\nSumma: 349 000");
    expect(r.candidates.filter((c) => c.value === 349000)).toHaveLength(1);
  });

  it("min/max chegarasini hurmat qiladi", () => {
    expect(extractAmount("Summa: 500", { min: 1000 }).amount).toBeNull();
    expect(extractAmount("Summa: 900000000", { max: 1000 }).amount).toBeNull();
  });
});

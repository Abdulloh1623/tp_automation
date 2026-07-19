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

// Guruh eksportidan olingan HAQIQIY OCR matnlari (rus tilidagi bank ilovalari)
const CLICK = `20:58 click all FT #9
Отчеты
click
Перевод на карту
707 000 сум
Успешно
Дата и время: 09.06.2026 в 20:58
Номер платежа: 5075330549
Карта списания: 860006******5182
Комиссия: 7777 сум`;

const BANK_TRANSFER = `10:13 50KB/c
Перевод отправлен
349 000 сум
Комиссия 2 443 сум
Laylo Haydarova
Готово`;

const IPAK_YULI = `BANK IPAK YO'LI
Пункт обслуживания: 906258
Терминал: 96300250
Карта получателя 561468******2708
Время оплаты: 06.07.2026 18:25:44
Стоимость услуги 4 939.00 сум
Сумма платежа: 453 939.00 сум
ID фискального чека: 78519477`;

describe("extractAmount — rus tilidagi bank ilovalari (haqiqiy OCR)", () => {
  it("Click: yorliq OLDINGI qatorda ('Перевод на карту')", () => {
    const r = extractAmount(CLICK);
    expect(r.amount).toBe(707000);
    expect(r.confidence).toBe("high");
  });

  it("Click: komissiyani tanlamaydi", () => {
    expect(extractAmount(CLICK).candidates.map((c) => c.value)).not.toContain(7777);
  });

  it("Click: to'lov/karta raqamlarini summa deb olmaydi", () => {
    const v = extractAmount(CLICK).candidates.map((c) => c.value);
    expect(v).not.toContain(5075330549);
  });

  it("'Перевод отправлен' + сум → ishonchli", () => {
    const r = extractAmount(BANK_TRANSFER);
    expect(r.amount).toBe(349000);
    expect(r.confidence).toBe("high");
    expect(r.currency).toBe("UZS");
  });

  it("Ipak Yo'li: 'Сумма платежа' xizmat narxidan ustun", () => {
    const r = extractAmount(IPAK_YULI);
    expect(r.amount).toBe(453939);
    expect(r.confidence).toBe("high");
  });

  it("Ipak Yo'li: 'Стоимость услуги' ni to'lov deb olmaydi", () => {
    expect(extractAmount(IPAK_YULI).candidates.map((c) => c.value)).not.toContain(4939);
  });

  it("valyuta belgisi bor, lekin eng katta emas → high emas", () => {
    // Yorliqsiz, kichikroq summa — ishonch past bo'lishi kerak
    const r = extractAmount("100 000 сум\n999999");
    expect(r.confidence).not.toBe("high");
  });
});

// Haqiqiy cheklardan: ko'rsatilgan katta summa = obuna narxi + komissiya.
// Bazaga KOMISSIYASIZ (kompaniyaga tushgan) summa yozilishi kerak.
const NET_STATED = `694 830 so'm
11-iyun, 2026 13:18
Operatsiya bajarildi
Yuboruvchi **** **** **** 7517
Qabul qiluvchi **** **** **** 2708
Tranzaksiya raqami 85539182150
Qabul qiluvchiga o'tkaziladigan summa 690 000 so'm
Komissiya 4 830 so'm`;

const NET_COMPUTED = `Ipak Yuli Bank
667 260 сум
Оплачено
12.06.2026 11:09
Карта получателя 561468******1928
Стоимость услуги 7 260.00 сум`;

describe("extractAmount — komissiyasiz (kompaniyaga tushgan) summa", () => {
  it("chekda yozilgan bo'lsa — o'shani tanlaydi", () => {
    const r = extractAmount(NET_STATED);
    expect(r.amount).toBe(690000);
    expect(r.confidence).toBe("high");
  });

  it("katta summani ham nomzod qilib saqlaydi", () => {
    expect(extractAmount(NET_STATED).candidates.map((c) => c.value)).toContain(694830);
  });

  it("chekda yozilmagan bo'lsa — katta summadan komissiyani ayiradi", () => {
    const r = extractAmount(NET_COMPUTED);
    expect(r.amount).toBe(660000); // 667 260 − 7 260
    expect(r.candidates[0].label).toContain("hisoblangan");
  });

  it("hisoblangan summa dumaloq bo'lmasa — taklif qilmaydi", () => {
    // 100 000 − 1 234 = 98 766 — dumaloq emas, ishonchsiz
    const r = extractAmount("100 000 сум\nКомиссия 1 234 сум");
    expect(r.candidates.map((c) => c.label)).not.toContain("Komissiyasiz (hisoblangan)");
  });

  it("bir nechta komissiya bo'lsa hisoblamaydi (noaniq)", () => {
    const r = extractAmount("100 000 сум\nКомиссия 5 000 сум\nКомиссия 3 000 сум");
    expect(r.candidates.every((c) => !c.label?.includes("hisoblangan"))).toBe(true);
  });

  it("komissiyaning o'zini to'lov deb olmaydi", () => {
    expect(extractAmount(NET_STATED).candidates.map((c) => c.value)).not.toContain(4830);
  });
});

// Qiyshiq suratlarda OCR yorliqlarni o'qimaydi — ekranda faqat ikki raqam
// qoladi (haqiqiy holat: photo_48).
const NO_LABELS = `667 260 сум
12.06.2026 11:09
561468******1928
7 260.00 сум
HUMO 9860 12** **** 0172`;

describe("extractAmount — yorliqsiz surat (OCR yorliqni o'qimagan)", () => {
  it("ikki raqamdan sof tushumni chiqaradi", () => {
    const r = extractAmount(NO_LABELS);
    expect(r.amount).toBe(660000); // 667 260 − 7 260
  });

  it("ishonch PAST bo'ladi — yorliq dalili yo'q", () => {
    expect(extractAmount(NO_LABELS).confidence).toBe("low");
  });

  it("katta summani ham nomzod qilib qoldiradi", () => {
    expect(extractAmount(NO_LABELS).candidates.map((c) => c.value)).toContain(667260);
  });

  it("kichik raqam komissiyaga o'xshamasa (10% dan katta) taxmin qilmaydi", () => {
    // 100 000 va 30 000 — bu komissiya emas, ikki alohida summa
    const r = extractAmount("100 000 сум\n30 000 сум");
    expect(r.candidates.every((c) => !c.label?.includes("taxminiy"))).toBe(true);
  });

  it("ayirma dumaloq bo'lmasa taxmin qilmaydi", () => {
    const r = extractAmount("100 000 сум\n1 234 сум");
    expect(r.candidates.every((c) => !c.label?.includes("taxminiy"))).toBe(true);
  });

  it("uchta raqam bo'lsa taxmin qilmaydi (juda noaniq)", () => {
    const r = extractAmount("100 000 сум\n5 000 сум\n20 000 сум");
    expect(r.candidates.every((c) => !c.label?.includes("taxminiy"))).toBe(true);
  });
});

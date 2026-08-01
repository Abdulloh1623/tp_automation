import { describe, it, expect } from "vitest";
import {
  classifyMovement,
  isInstall,
  bucketFlowByMonth,
  installSourceBreakdown,
  perUstaFlow,
  check29Rule,
  splitClientMix,
  expectedRentalValue,
  type MovementLike,
} from "./inventory-stats";

const mv = (
  fromType: string | null,
  toType: string | null,
  quantity = 1,
  extra: Partial<MovementLike> = {},
): MovementLike => ({
  quantity,
  fromType,
  toType,
  createdAt: new Date("2026-07-10T10:00:00Z"),
  equipmentTypeId: "t1",
  ...extra,
});

describe("classifyMovement", () => {
  it("ombor kirimi", () => {
    expect(classifyMovement(mv(null, "WAREHOUSE"))).toBe("INBOUND");
  });

  it("ustaga taqsimot va ustadan qaytarish", () => {
    expect(classifyMovement(mv("WAREHOUSE", "USTA"))).toBe("TO_USTA");
    expect(classifyMovement(mv("USTA", "WAREHOUSE"))).toBe("USTA_BACK");
  });

  it("o'rnatish — manba bo'yicha ajraladi", () => {
    expect(classifyMovement(mv("WAREHOUSE", "CLIENT"))).toBe("INSTALL_WAREHOUSE");
    expect(classifyMovement(mv("USTA", "CLIENT"))).toBe("INSTALL_USTA");
    expect(classifyMovement(mv(null, "CLIENT"))).toBe("INSTALL_LEGACY");
  });

  it("brak har qanday manbadan — SCRAP", () => {
    expect(classifyMovement(mv("WAREHOUSE", "BRAK"))).toBe("SCRAP");
    expect(classifyMovement(mv("USTA", "BRAK"))).toBe("SCRAP");
  });

  it("mijozdan qaytarish — manzilidan qat'i nazar CLIENT_RETURN", () => {
    expect(classifyMovement(mv("CLIENT", "WAREHOUSE"))).toBe("CLIENT_RETURN");
    expect(classifyMovement(mv("CLIENT", "USTA"))).toBe("CLIENT_RETURN");
  });

  it("mijozdan brakka — SCRAP ustun (ikki marta sanalmasin)", () => {
    expect(classifyMovement(mv("CLIENT", "BRAK"))).toBe("SCRAP");
  });

  it("inventarizatsiya kamaytirishi", () => {
    expect(classifyMovement(mv("WAREHOUSE", null))).toBe("ADJUST_OUT");
  });

  it("isInstall — faqat mijozga ketganlar", () => {
    expect(isInstall("INSTALL_USTA")).toBe(true);
    expect(isInstall("INSTALL_LEGACY")).toBe(true);
    expect(isInstall("TO_USTA")).toBe(false);
    expect(isInstall("SCRAP")).toBe(false);
  });
});

describe("bucketFlowByMonth", () => {
  const now = new Date(2026, 6, 21); // 2026-iyul-21

  it("oynadagi oylarni eskidan yangiga qaytaradi", () => {
    const b = bucketFlowByMonth([], 3, now);
    expect(b.map((x) => x.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(b.map((x) => x.label)).toEqual(["May", "Iyun", "Iyul"]);
  });

  it("miqdorlarni to'g'ri oyga yig'adi", () => {
    const movements = [
      mv(null, "WAREHOUSE", 10, { createdAt: new Date(2026, 5, 3) }),
      mv("WAREHOUSE", "USTA", 4, { createdAt: new Date(2026, 6, 2) }),
      mv("USTA", "CLIENT", 2, { createdAt: new Date(2026, 6, 5) }),
      mv("WAREHOUSE", "CLIENT", 3, { createdAt: new Date(2026, 6, 9) }),
      mv("WAREHOUSE", "BRAK", 1, { createdAt: new Date(2026, 6, 11) }),
    ];
    const [may, iyun, iyul] = bucketFlowByMonth(movements, 3, now);
    expect(may.inbound).toBe(0);
    expect(iyun.inbound).toBe(10);
    expect(iyul.toUsta).toBe(4);
    expect(iyul.installUsta).toBe(2);
    expect(iyul.installWarehouse).toBe(3);
    expect(iyul.installed).toBe(5); // uch manbadan jami
    expect(iyul.scrap).toBe(1);
  });

  it("oynadan tashqaridagi harakat hisobga olinmaydi", () => {
    const old = [mv(null, "WAREHOUSE", 99, { createdAt: new Date(2025, 0, 1) })];
    const b = bucketFlowByMonth(old, 3, now);
    expect(b.reduce((s, x) => s + x.inbound, 0)).toBe(0);
  });

  it("yil chegarasidan o'tadi", () => {
    const b = bucketFlowByMonth([], 3, new Date(2026, 0, 15));
    expect(b.map((x) => x.key)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("installSourceBreakdown", () => {
  it("usta/sklad ulushini foizda beradi", () => {
    const s = installSourceBreakdown([
      mv("USTA", "CLIENT", 3),
      mv("WAREHOUSE", "CLIENT", 1),
      mv(null, "CLIENT", 5), // tarixiy — foizga kirmaydi
      mv("WAREHOUSE", "USTA", 10), // o'rnatish emas
    ]);
    expect(s.fromUsta).toBe(3);
    expect(s.fromWarehouse).toBe(1);
    expect(s.legacy).toBe(5);
    expect(s.known).toBe(4);
    expect(s.ustaPct).toBe(75);
    expect(s.warehousePct).toBe(25);
  });

  it("o'rnatish yo'q — foiz 0, bo'linish xatosi yo'q", () => {
    const s = installSourceBreakdown([mv(null, "WAREHOUSE", 5)]);
    expect(s.known).toBe(0);
    expect(s.ustaPct).toBe(0);
  });
});

describe("perUstaFlow", () => {
  const ustalar = [
    { id: "u1", name: "Aziz" },
    { id: "u2", name: "Bobur" },
  ];

  it("olgan/o'rnatgan/qaytargan bo'yicha hisoblaydi", () => {
    const movements = [
      mv("WAREHOUSE", "USTA", 10, { toId: "u1" }),
      mv("USTA", "CLIENT", 6, { fromId: "u1" }),
      mv("USTA", "WAREHOUSE", 2, { fromId: "u1" }),
      mv("USTA", "BRAK", 1, { fromId: "u1" }),
      mv("WAREHOUSE", "USTA", 3, { toId: "u2" }),
    ];
    const rows = perUstaFlow(movements, ustalar, new Map([["u1", 1], ["u2", 3]]));
    const a = rows.find((r) => r.ustaId === "u1")!;
    expect(a.received).toBe(10);
    expect(a.installed).toBe(6);
    expect(a.returned).toBe(2);
    expect(a.scrapped).toBe(1);
    expect(a.expected).toBe(1);
    expect(a.diff).toBe(0); // qoldiq mos
  });

  it("qoldiq mos kelmasa diff ko'rsatadi", () => {
    const rows = perUstaFlow(
      [mv("WAREHOUSE", "USTA", 5, { toId: "u1" })],
      ustalar,
      new Map([["u1", 2]]),
    );
    const a = rows.find((r) => r.ustaId === "u1")!;
    expect(a.expected).toBe(5);
    expect(a.diff).toBe(-3);
  });

  it("mijozdan ustaga qaytgan uskuna ustaning zaxirasiga qo'shiladi", () => {
    const rows = perUstaFlow(
      [mv("CLIENT", "USTA", 2, { toId: "u1" })],
      ustalar,
      new Map([["u1", 2]]),
    );
    expect(rows.find((r) => r.ustaId === "u1")!.received).toBe(2);
  });

  it("o'rnatgani bo'yicha kamayish tartibida", () => {
    const rows = perUstaFlow(
      [
        mv("USTA", "CLIENT", 1, { fromId: "u1" }),
        mv("USTA", "CLIENT", 9, { fromId: "u2" }),
      ],
      ustalar,
      new Map(),
    );
    expect(rows[0].ustaId).toBe("u2");
  });

  it("noma'lum usta id — yiqilmaydi", () => {
    const rows = perUstaFlow([mv("WAREHOUSE", "USTA", 5, { toId: "yoq" })], ustalar, new Map());
    expect(rows.every((r) => r.received === 0)).toBe(true);
  });
});

describe("check29Rule", () => {
  const c = (
    id: string,
    monthlyAmount: number,
    rentedQty: number,
    currency = "USD",
  ) => ({ id, restaurantName: id, monthlyAmount, currency, rentedQty });

  it("aynan 29$ + uskuna bor => nomuvofiq", () => {
    const r = check29Rule([c("a", 29, 1)]);
    expect(r.baseWithEquipment.map((x) => x.id)).toEqual(["a"]);
    expect(r.okCount).toBe(0);
  });

  it("aynan 29$ + uskuna yo'q => to'g'ri", () => {
    const r = check29Rule([c("a", 29, 0)]);
    expect(r.baseWithEquipment).toHaveLength(0);
    expect(r.okCount).toBe(1);
  });

  it("29$ dan ortiq + uskuna yo'q => nomuvofiq", () => {
    const r = check29Rule([c("a", 45, 0)]);
    expect(r.aboveBaseWithoutEquipment.map((x) => x.id)).toEqual(["a"]);
  });

  it("29$ dan ortiq + uskuna bor => to'g'ri", () => {
    const r = check29Rule([c("a", 45, 2)]);
    expect(r.aboveBaseWithoutEquipment).toHaveLength(0);
    expect(r.okCount).toBe(1);
  });

  it("29$ dan past => alohida ro'yxat (shubhali)", () => {
    const r = check29Rule([c("a", 15, 0)]);
    expect(r.belowBase.map((x) => x.id)).toEqual(["a"]);
  });

  it("UZS mijoz tekshirilmaydi", () => {
    const r = check29Rule([c("a", 500000, 3, "UZS")]);
    expect(r.skippedNonUsd).toBe(1);
    expect(r.checked).toBe(0);
  });

  it("oyligi 0 — to'ldirilmagan, tekshiruvdan tashqarida", () => {
    const r = check29Rule([c("a", 0, 0)]);
    expect(r.skippedZero).toBe(1);
    expect(r.checked).toBe(0);
  });

  // Oyligi kiritilmaganlar "muammoli mijozlar" bo'limida ro'yxat bo'lib
  // ko'rinadi — faqat sanoq yetarli emas edi.
  it("oyligi 0 — zeroAmount ro'yxatiga tushadi", () => {
    const r = check29Rule([c("a", 0, 0), c("b", 45, 1)]);
    expect(r.zeroAmount.map((x) => x.id)).toEqual(["a"]);
    expect(r.zeroAmount).toHaveLength(r.skippedZero);
  });

  // Generik: chaqiruvchi qo'shgan maydonlar natijada saqlanadi (ro'yxatni
  // ko'rsatish uchun mijozlarni id bo'yicha qayta ulash shart bo'lmasin).
  it("qo'shimcha maydonlar natijada saqlanadi", () => {
    const r = check29Rule([{ ...c("a", 45, 0), phone: "+998901112233" }]);
    expect(r.aboveBaseWithoutEquipment[0].phone).toBe("+998901112233");
  });

  it("29 atrofidagi kasr (29.004) — bazaviy deb hisoblanadi", () => {
    const r = check29Rule([c("a", 29.004, 0)]);
    expect(r.okCount).toBe(1);
    expect(r.belowBase).toHaveLength(0);
  });

  it("29.5 — bazaviydan ortiq deb hisoblanadi", () => {
    const r = check29Rule([c("a", 29.5, 0)]);
    expect(r.aboveBaseWithoutEquipment).toHaveLength(1);
  });

  it("nomuvofiqlar oylik summasi bo'yicha kamayish tartibida", () => {
    const r = check29Rule([c("a", 40, 0), c("b", 60, 0), c("d", 50, 0)]);
    expect(r.aboveBaseWithoutEquipment.map((x) => x.id)).toEqual(["b", "d", "a"]);
  });

  it("bazaviy narx o'zgarganda qoida yangi narxga ko'ra ishlaydi", () => {
    const r = check29Rule([c("a", 29, 1), c("b", 39, 0)], 39);
    // 29 endi bazaviydan PAST, 39 esa bazaviy (uskunasiz — to'g'ri)
    expect(r.belowBase.map((x) => x.id)).toEqual(["a"]);
    expect(r.okCount).toBe(1);
  });
});

describe("expectedRentalValue", () => {
  it("oylikdan bazaviy narxni ayiradi", () => {
    expect(expectedRentalValue(45, "USD")).toBe(16);
  });
  it("bazaviy yoki past — 0", () => {
    expect(expectedRentalValue(29, "USD")).toBe(0);
    expect(expectedRentalValue(10, "USD")).toBe(0);
  });
  it("UZS — qoida qo'llanmaydi", () => {
    expect(expectedRentalValue(500000, "UZS")).toBe(0);
  });
});

// Mijozlarni uskuna egaligi bo'yicha uchga bo'lish. Asosiy shart: uchta son
// HAR DOIM jamiga teng bo'lsin — aks holda sahifadagi foizlar 100% dan
// oshib/kam bo'lib ketardi.
describe("splitClientMix", () => {
  const eq = (clientId: string, ownership: string, quantity = 1) => ({
    clientId,
    ownership,
    quantity,
  });

  it("ijara / sotuv / faqat dastur ga ajratadi", () => {
    const r = splitClientMix(["a", "b", "c"], [eq("a", "RENTAL"), eq("b", "SOLD")]);
    expect(r).toEqual({ rental: 1, sold: 1, programOnly: 1, total: 3 });
  });

  it("ham ijara, ham sotuvi bor mijoz FAQAT ijarada sanaladi", () => {
    const r = splitClientMix(["a"], [eq("a", "RENTAL"), eq("a", "SOLD")]);
    expect(r).toEqual({ rental: 1, sold: 0, programOnly: 0, total: 1 });
  });

  it("bir mijozning bir necha yozuvi ikki marta sanalmaydi", () => {
    const r = splitClientMix(["a"], [eq("a", "RENTAL", 3), eq("a", "RENTAL", 2)]);
    expect(r.rental).toBe(1);
  });

  it("miqdori 0 bo'lgan yozuv hisobga olinmaydi", () => {
    const r = splitClientMix(["a"], [eq("a", "RENTAL", 0)]);
    expect(r).toEqual({ rental: 0, sold: 0, programOnly: 1, total: 1 });
  });

  it("nofaol mijozning yozuvi jamini buzmaydi", () => {
    // "x" faol ro'yxatda yo'q — uning uskunasi e'tiborga olinmaydi.
    const r = splitClientMix(["a"], [eq("x", "RENTAL"), eq("a", "SOLD")]);
    expect(r).toEqual({ rental: 0, sold: 1, programOnly: 0, total: 1 });
  });

  it("uchta son har doim jamiga teng", () => {
    const r = splitClientMix(
      ["a", "b", "c", "d"],
      [eq("a", "RENTAL"), eq("b", "SOLD"), eq("c", "RENTAL"), eq("c", "SOLD")],
    );
    expect(r.rental + r.sold + r.programOnly).toBe(r.total);
  });
});

import { describe, it, expect } from "vitest";
import {
  phoneDupKey,
  contractDupKey,
  nameDupKey,
  findDuplicateGroups,
  type DupClientInput,
} from "./duplicates";

function c(over: Partial<DupClientInput> & { id: string }): DupClientInput {
  return {
    fullName: "",
    restaurantName: "",
    phone: "",
    ...over,
  };
}

describe("phoneDupKey", () => {
  it("oxirgi 9 raqamni oladi (998 prefiksisiz)", () => {
    expect(phoneDupKey("+998 90 481 43 75")).toBe("904814375");
    expect(phoneDupKey("904814375")).toBe("904814375");
  });
  it("qisqa/axlat raqam → bo'sh", () => {
    expect(phoneDupKey("123")).toBe("");
    expect(phoneDupKey("000000000")).toBe("");
    expect(phoneDupKey(null)).toBe("");
  });
});

describe("contractDupKey", () => {
  it("bo'shliq/tireni tozalaydi", () => {
    expect(contractDupKey("AB 130326-158")).toBe("AB130326158");
  });
  it("kamida 4 raqam bo'lmasa → bo'sh", () => {
    expect(contractDupKey("AB")).toBe("");
    expect(contractDupKey("")).toBe("");
  });
});

describe("nameDupKey", () => {
  it("normallashtiradi", () => {
    expect(nameDupKey("  Sulton   Kafe ")).toBe("sulton kafe");
  });
  it("juda qisqa → bo'sh", () => {
    expect(nameDupKey("ka")).toBe("");
  });
});

describe("findDuplicateGroups", () => {
  it("bir xil telefon → yuqori ishonchli guruh", () => {
    const groups = findDuplicateGroups([
      c({ id: "1", restaurantName: "Osh", phone: "+998 90 111 22 33" }),
      c({ id: "2", restaurantName: "Palov", phone: "90 111 22 33" }),
      c({ id: "3", restaurantName: "Boshqa", phone: "90 999 88 77" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].clients.map((x) => x.id).sort()).toEqual(["1", "2"]);
    expect(groups[0].confidence).toBe("high");
    expect(groups[0].reasons).toContain("phone");
  });

  it("qo'shimcha telefon (ClientPhone) ham hisobga olinadi", () => {
    const groups = findDuplicateGroups([
      c({ id: "1", phone: "90 111 22 33" }),
      c({ id: "2", phone: "90 555 44 33", phones: [{ number: "901112233" }] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasons).toContain("phone");
  });

  it("bir xil shartnoma → yuqori ishonchli", () => {
    const groups = findDuplicateGroups([
      c({ id: "1", contractNumber: "AB130326158", phone: "90 111 22 33" }),
      c({ id: "2", contractNumber: "AB 130326 158", phone: "90 222 33 44" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("high");
    expect(groups[0].reasons).toContain("contract");
  });

  it("faqat nom mos → o'rta ishonchli", () => {
    const groups = findDuplicateGroups([
      c({ id: "1", restaurantName: "Sulton Kafe", phone: "90 111 22 33" }),
      c({ id: "2", restaurantName: "sulton kafe", phone: "90 222 33 44" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("medium");
    expect(groups[0].reasons).toEqual(["name"]);
  });

  it("umumiy nom (juda ko'p mos) bo'yicha birlashtirmaydi", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      c({ id: `n${i}`, restaurantName: "Restoran", phone: `90 000 00 0${i}` }),
    );
    const groups = findDuplicateGroups(many);
    expect(groups).toHaveLength(0);
  });

  it("telefon va nom orqali zanjir bir guruhga birlashadi", () => {
    const groups = findDuplicateGroups([
      c({ id: "1", restaurantName: "Osh Markazi", phone: "90 111 22 33" }),
      c({ id: "2", restaurantName: "Osh Markazi", phone: "90 444 55 66" }),
      c({ id: "3", restaurantName: "Boshqa Joy", phone: "90 444 55 66" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].clients).toHaveLength(3);
    expect(groups[0].reasons).toEqual(
      expect.arrayContaining(["phone", "name"]),
    );
  });

  it("dublikat yo'q → bo'sh", () => {
    const groups = findDuplicateGroups([
      c({ id: "1", restaurantName: "Alfa", phone: "90 111 11 11" }),
      c({ id: "2", restaurantName: "Beta", phone: "90 222 22 22" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("guruh ichida eng eski yozuv birinchi", () => {
    const groups = findDuplicateGroups([
      c({ id: "new", phone: "90 111 22 33", createdAt: "2026-01-02" }),
      c({ id: "old", phone: "90 111 22 33", createdAt: "2025-01-01" }),
    ]);
    expect(groups[0].clients[0].id).toBe("old");
  });

  it("guruhda a'zolar orasidagi to'g'ridan-to'g'ri juftliklarni qaytaradi", () => {
    const groups = findDuplicateGroups([
      c({ id: "1", restaurantName: "Osh Markazi", phone: "90 111 22 33" }),
      c({ id: "2", restaurantName: "Osh Markazi", phone: "90 444 55 66" }),
    ]);
    expect(groups[0].pairs).toHaveLength(1);
    expect(groups[0].pairs[0].a.id).toBe("1");
    expect(groups[0].pairs[0].b.id).toBe("2");
    expect(groups[0].pairs[0].reasons).toEqual(["name"]);
  });
});

describe("findDuplicateGroups — dublikat emas (dismissed juftlik)", () => {
  it("rad etilgan juftlik boshqa guruh hosil qilmaydi", () => {
    const clients = [
      c({ id: "1", phone: "90 111 22 33" }),
      c({ id: "2", phone: "90 111 22 33" }),
    ];
    const groups = findDuplicateGroups(clients, [{ clientAId: "1", clientBId: "2" }]);
    expect(groups).toHaveLength(0);
  });

  it("juftlik tartibi (A/B) farqi qilmaydi — teskari tartibda ham rad etiladi", () => {
    const clients = [
      c({ id: "1", phone: "90 111 22 33" }),
      c({ id: "2", phone: "90 111 22 33" }),
    ];
    const groups = findDuplicateGroups(clients, [{ clientAId: "2", clientBId: "1" }]);
    expect(groups).toHaveLength(0);
  });

  it("zanjirda faqat rad etilgan juftlik chiqadi — qolgan bog'lanish saqlanadi", () => {
    // 1-2 nom orqali, 2-3 telefon orqali bog'langan (mavjud "zanjir" testi bilan bir xil holat).
    const clients = [
      c({ id: "1", restaurantName: "Osh Markazi", phone: "90 111 22 33" }),
      c({ id: "2", restaurantName: "Osh Markazi", phone: "90 444 55 66" }),
      c({ id: "3", restaurantName: "Boshqa Joy", phone: "90 444 55 66" }),
    ];
    // 1-2 juftligi "dublikat emas" deb belgilangan.
    const groups = findDuplicateGroups(clients, [{ clientAId: "1", clientBId: "2" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].clients.map((x) => x.id).sort()).toEqual(["2", "3"]);
    expect(groups[0].reasons).toEqual(["phone"]);
  });

  it("faqat bitta sababi bo'lgan juftlik rad etilsa, boshqa sabab bilan bog'liq bo'lmasa butunlay ajraladi", () => {
    const clients = [
      c({ id: "1", contractNumber: "AB130326158", phone: "90 111 22 33" }),
      c({ id: "2", contractNumber: "AB130326158", phone: "90 222 33 44" }),
      c({ id: "3", contractNumber: "AB130326158", phone: "90 333 44 55" }),
    ];
    // 1-2 va 1-3 rad etiladi, 2-3 hali ham shartnoma bo'yicha bog'langan.
    const groups = findDuplicateGroups(clients, [
      { clientAId: "1", clientBId: "2" },
      { clientAId: "1", clientBId: "3" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].clients.map((x) => x.id).sort()).toEqual(["2", "3"]);
  });
});

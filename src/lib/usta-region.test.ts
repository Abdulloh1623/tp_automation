import { describe, it, expect } from "vitest";
import { findUstaForRegion, resolveClientUsta, type UstaRef } from "./usta-region";

const anvar: UstaRef = { id: "u-anvar", name: "Anvar", region: null, regions: "Samarqand, Jizzax" };
const azamat: UstaRef = {
  id: "u-azamat",
  name: "Azamat",
  region: null,
  regions: "Qoraqalpog'iston, Xorazm",
};
const eski: UstaRef = { id: "u-eski", name: "Eski", region: "Navoiy", regions: null };
const USTALAR = [anvar, azamat, eski];

describe("findUstaForRegion", () => {
  it("vergulli ro'yxatdan topadi", () => {
    expect(findUstaForRegion(USTALAR, "Jizzax")?.id).toBe("u-anvar");
  });

  it("eski bitta `region` maydonini ham hisobga oladi", () => {
    expect(findUstaForRegion(USTALAR, "Navoiy")?.id).toBe("u-eski");
  });

  it("yozilishi har xil viloyat nomini moslaydi", () => {
    expect(findUstaForRegion(USTALAR, "Qoraqalpoq")?.id).toBe("u-azamat");
  });

  it("viloyatsiz yoki qoplanmagan mijoz — null", () => {
    expect(findUstaForRegion(USTALAR, null)).toBeNull();
    expect(findUstaForRegion(USTALAR, "   ")).toBeNull();
    expect(findUstaForRegion(USTALAR, "Andijon")).toBeNull();
  });
});

describe("resolveClientUsta", () => {
  it("biriktirilgan usta hududdan ustun", () => {
    const r = resolveClientUsta(
      { region: "Samarqand", assignedUstaId: "u-azamat" },
      USTALAR,
    );
    expect(r).toEqual({ ustaId: "u-azamat", ustaName: "Azamat", byRegion: false });
  });

  it("biriktirilmagan bo'lsa hudud bo'yicha taxmin qiladi", () => {
    const r = resolveClientUsta({ region: "Samarqand", assignedUstaId: null }, USTALAR);
    expect(r).toEqual({ ustaId: "u-anvar", ustaName: "Anvar", byRegion: true });
  });

  it("faolsiz/o'chgan usta biriktirilgan bo'lsa — id saqlanadi, nom mijozdan olinadi", () => {
    const r = resolveClientUsta(
      { region: "Andijon", assignedUstaId: "u-yoq", assignedUstaName: "Eski usta" },
      USTALAR,
    );
    expect(r).toEqual({ ustaId: "u-yoq", ustaName: "Eski usta", byRegion: false });
  });

  it("na biriktirilgan, na hudud mos — bo'sh", () => {
    const r = resolveClientUsta({ region: "Andijon", assignedUstaId: null }, USTALAR);
    expect(r).toEqual({ ustaId: null, ustaName: null, byRegion: false });
  });
});

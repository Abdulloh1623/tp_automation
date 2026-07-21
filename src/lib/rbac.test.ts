import { describe, it, expect } from "vitest";
import { canAccess, roleHome } from "./rbac";

describe("roleHome", () => {
  it("har rol o'z boshlang'ich sahifasiga", () => {
    expect(roleHome("ADMIN")).toBe("/");
    expect(roleHome("MANAGER")).toBe("/ombor");
    expect(roleHome("OPERATOR")).toBe("/lidlar");
    expect(roleHome("INSTALLER")).toBe("/login"); // ustalar tizimga kirmaydi
  });
});

describe("canAccess", () => {
  it("bosh sahifa faqat ADMIN", () => {
    expect(canAccess("ADMIN", "/")).toBe(true);
    expect(canAccess("MANAGER", "/")).toBe(false);
    expect(canAccess("OPERATOR", "/")).toBe(false);
  });

  it("admin-only bo'limlar", () => {
    for (const p of ["/foydalanuvchilar", "/audit", "/import"]) {
      expect(canAccess("ADMIN", p), p).toBe(true);
      expect(canAccess("MANAGER", p), p).toBe(false);
      expect(canAccess("OPERATOR", p), p).toBe(false);
    }
  });

  it("ombor/analitika — ADMIN va MANAGER", () => {
    for (const p of ["/ombor", "/ustalar", "/analitika", "/moliya", "/hisobot", "/uskuna-analitika"]) {
      expect(canAccess("MANAGER", p), p).toBe(true);
      expect(canAccess("OPERATOR", p), p).toBe(false);
    }
  });

  it("operator bo'limlari", () => {
    for (const p of ["/lidlar", "/mijozlar", "/tolovlar", "/muammolar"]) {
      expect(canAccess("OPERATOR", p), p).toBe(true);
    }
  });

  it("ichki yo'llar prefiks bo'yicha meros oladi", () => {
    expect(canAccess("OPERATOR", "/mijozlar/abc123")).toBe(true);
    expect(canAccess("OPERATOR", "/mijozlar/abc123/tahrir")).toBe(true);
    expect(canAccess("OPERATOR", "/ombor/nimadir")).toBe(false);
  });

  it("prefiks chalkashligi yo'q — /ombor-maxfiy /ombor emas", () => {
    // Qoidasi yo'q, ya'ni endi YOPIQ (ilgari ochiq edi).
    expect(canAccess("MANAGER", "/ombor-maxfiy")).toBe(false);
    expect(canAccess("ADMIN", "/ombor-maxfiy")).toBe(false);
  });

  it("QAT'IY YOPIQ: jadvalda yo'q sahifa hech kimga ochilmaydi", () => {
    for (const role of ["ADMIN", "MANAGER", "OPERATOR"]) {
      expect(canAccess(role, "/yangi-bolim"), role).toBe(false);
      expect(canAccess(role, "/hali-yozilmagan/sahifa"), role).toBe(false);
    }
  });

  it("/tablo — barcha xodimlarga ochiq (jonli tablo)", () => {
    expect(canAccess("ADMIN", "/tablo")).toBe(true);
    expect(canAccess("MANAGER", "/tablo")).toBe(true);
    expect(canAccess("OPERATOR", "/tablo")).toBe(true);
  });

  it("/malumotlar — faqat ADMIN", () => {
    expect(canAccess("ADMIN", "/malumotlar")).toBe(true);
    expect(canAccess("MANAGER", "/malumotlar")).toBe(false);
    expect(canAccess("OPERATOR", "/malumotlar")).toBe(false);
  });

  it("/api/* bu yerda bloklanmaydi — handler o'zi tekshiradi", () => {
    expect(canAccess("OPERATOR", "/api/export/clients")).toBe(true);
    expect(canAccess("OPERATOR", "/api/health")).toBe(true);
  });

  it("noma'lum rol hech qayerga kira olmaydi", () => {
    expect(canAccess("HACKER", "/mijozlar")).toBe(false);
    expect(canAccess("", "/lidlar")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { canAccess, roleHome } from "./rbac";

describe("roleHome", () => {
  it("har rol o'z boshlang'ich sahifasiga", () => {
    expect(roleHome("ADMIN")).toBe("/");
    expect(roleHome("SUPER_ADMIN")).toBe("/");
    expect(roleHome("HEAD_OF_SUPPORT")).toBe("/");
    expect(roleHome("OPERATOR")).toBe("/lidlar");
    expect(roleHome("INSTALLER")).toBe("/vazifalarim");
    expect(roleHome("VIEWER")).toBe("/");
  });
});

describe("canAccess", () => {
  it("bosh sahifa — ADMIN, SUPER_ADMIN, HEAD_OF_SUPPORT va VIEWER", () => {
    expect(canAccess("ADMIN", "/")).toBe(true);
    expect(canAccess("SUPER_ADMIN", "/")).toBe(true);
    expect(canAccess("HEAD_OF_SUPPORT", "/")).toBe(true);
    expect(canAccess("VIEWER", "/")).toBe(true);
    expect(canAccess("OPERATOR", "/")).toBe(false);
  });

  it("/foydalanuvchilar — ADMIN/SUPER_ADMIN/HEAD_OF_SUPPORT/VIEWER, OPERATOR yo'q", () => {
    expect(canAccess("ADMIN", "/foydalanuvchilar")).toBe(true);
    expect(canAccess("SUPER_ADMIN", "/foydalanuvchilar")).toBe(true);
    expect(canAccess("HEAD_OF_SUPPORT", "/foydalanuvchilar")).toBe(true);
    expect(canAccess("VIEWER", "/foydalanuvchilar")).toBe(true);
    expect(canAccess("OPERATOR", "/foydalanuvchilar")).toBe(false);
  });

  it("/audit — ADMIN/SUPER_ADMIN/VIEWER, HEAD_OF_SUPPORT ataylab YO'Q", () => {
    expect(canAccess("ADMIN", "/audit")).toBe(true);
    expect(canAccess("SUPER_ADMIN", "/audit")).toBe(true);
    expect(canAccess("VIEWER", "/audit")).toBe(true);
    expect(canAccess("HEAD_OF_SUPPORT", "/audit")).toBe(false);
    expect(canAccess("OPERATOR", "/audit")).toBe(false);
  });

  it("/import — ADMIN/SUPER_ADMIN/HEAD_OF_SUPPORT (eski manzil), VIEWER'ga yo'q", () => {
    expect(canAccess("ADMIN", "/import")).toBe(true);
    expect(canAccess("SUPER_ADMIN", "/import")).toBe(true);
    expect(canAccess("HEAD_OF_SUPPORT", "/import")).toBe(true);
    expect(canAccess("VIEWER", "/import")).toBe(false);
    expect(canAccess("OPERATOR", "/import")).toBe(false);
  });

  it("VIEWER — ADMIN bilan bir xil ko'rish, lekin sof boshqaruv vositalari YO'Q", () => {
    for (const p of ["/foydalanuvchilar", "/audit", "/mijozlar", "/tolovlar", "/muammolar", "/ombor", "/ustalar", "/analitika", "/moliya", "/hisobot", "/uskuna-analitika", "/lidlar", "/faq", "/tablo"]) {
      expect(canAccess("VIEWER", p), p).toBe(true);
    }
    // Sof boshqaruv vositalari (jadval, sozlamalar) — VIEWER'ga yo'q.
    // /malumotlar va /import endi HEAD_OF_SUPPORT'ga ochiq, lekin VIEWER'ga hamon yo'q.
    for (const p of ["/malumotlar", "/sozlamalar", "/ish-jadvali", "/import"]) {
      expect(canAccess("VIEWER", p), p).toBe(false);
    }
  });

  it("ombor/analitika — ADMIN, SUPER_ADMIN va HEAD_OF_SUPPORT", () => {
    for (const p of ["/ombor", "/ustalar", "/analitika", "/uskuna-analitika"]) {
      expect(canAccess("SUPER_ADMIN", p), p).toBe(true);
      expect(canAccess("HEAD_OF_SUPPORT", p), p).toBe(true);
      expect(canAccess("OPERATOR", p), p).toBe(false);
    }
  });

  it("moliya/hisobot — ADMIN/SUPER_ADMIN, HEAD_OF_SUPPORT ataylab YO'Q (moliyaviy ma'lumot)", () => {
    for (const p of ["/moliya", "/hisobot"]) {
      expect(canAccess("ADMIN", p), p).toBe(true);
      expect(canAccess("SUPER_ADMIN", p), p).toBe(true);
      expect(canAccess("HEAD_OF_SUPPORT", p), p).toBe(false);
      expect(canAccess("OPERATOR", p), p).toBe(false);
    }
  });

  it("operator bo'limlari — OPERATOR va HEAD_OF_SUPPORT", () => {
    for (const p of ["/lidlar", "/mijozlar", "/tolovlar", "/muammolar"]) {
      expect(canAccess("OPERATOR", p), p).toBe(true);
      expect(canAccess("HEAD_OF_SUPPORT", p), p).toBe(true);
    }
  });

  it("ichki yo'llar prefiks bo'yicha meros oladi", () => {
    expect(canAccess("OPERATOR", "/mijozlar/abc123")).toBe(true);
    expect(canAccess("OPERATOR", "/mijozlar/abc123/tahrir")).toBe(true);
    expect(canAccess("OPERATOR", "/ombor/nimadir")).toBe(false);
  });

  it("prefiks chalkashligi yo'q — /ombor-maxfiy /ombor emas", () => {
    // Qoidasi yo'q, ya'ni endi YOPIQ (ilgari ochiq edi).
    expect(canAccess("SUPER_ADMIN", "/ombor-maxfiy")).toBe(false);
    expect(canAccess("ADMIN", "/ombor-maxfiy")).toBe(false);
  });

  it("QAT'IY YOPIQ: jadvalda yo'q sahifa hech kimga ochilmaydi", () => {
    for (const role of ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR"]) {
      expect(canAccess(role, "/yangi-bolim"), role).toBe(false);
      expect(canAccess(role, "/hali-yozilmagan/sahifa"), role).toBe(false);
    }
  });

  it("/tablo — barcha xodimlarga ochiq (jonli tablo)", () => {
    expect(canAccess("ADMIN", "/tablo")).toBe(true);
    expect(canAccess("SUPER_ADMIN", "/tablo")).toBe(true);
    expect(canAccess("HEAD_OF_SUPPORT", "/tablo")).toBe(true);
    expect(canAccess("OPERATOR", "/tablo")).toBe(true);
  });

  it("/faq — barcha xodimga ochiq (tahrir/o'chirish action'da cheklanadi)", () => {
    expect(canAccess("ADMIN", "/faq")).toBe(true);
    expect(canAccess("SUPER_ADMIN", "/faq")).toBe(true);
    expect(canAccess("HEAD_OF_SUPPORT", "/faq")).toBe(true);
    expect(canAccess("OPERATOR", "/faq")).toBe(true);
    expect(canAccess("HACKER", "/faq")).toBe(false);
  });

  it("/malumotlar — ADMIN/SUPER_ADMIN/HEAD_OF_SUPPORT (ommaviy yuklash), VIEWER'ga yo'q", () => {
    expect(canAccess("ADMIN", "/malumotlar")).toBe(true);
    expect(canAccess("SUPER_ADMIN", "/malumotlar")).toBe(true);
    expect(canAccess("HEAD_OF_SUPPORT", "/malumotlar")).toBe(true);
    expect(canAccess("VIEWER", "/malumotlar")).toBe(false);
    expect(canAccess("OPERATOR", "/malumotlar")).toBe(false);
  });

  it("/vazifalarim — faqat INSTALLER (usta)", () => {
    expect(canAccess("INSTALLER", "/vazifalarim")).toBe(true);
    expect(canAccess("ADMIN", "/vazifalarim")).toBe(false);
    expect(canAccess("SUPER_ADMIN", "/vazifalarim")).toBe(false);
    expect(canAccess("HEAD_OF_SUPPORT", "/vazifalarim")).toBe(false);
    expect(canAccess("OPERATOR", "/vazifalarim")).toBe(false);
    expect(canAccess("VIEWER", "/vazifalarim")).toBe(false);
  });

  it("INSTALLER boshqa hech qayerga kirmaydi", () => {
    for (const p of ["/", "/lidlar", "/muammolar", "/ustalar", "/tablo"]) {
      expect(canAccess("INSTALLER", p), p).toBe(false);
    }
  });

  it("/mijozlar va /profil — INSTALLER ham ko'ra oladi (o'qish uchun)", () => {
    expect(canAccess("INSTALLER", "/mijozlar")).toBe(true);
    expect(canAccess("INSTALLER", "/mijozlar/abc123")).toBe(true);
    expect(canAccess("INSTALLER", "/profil")).toBe(true);
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

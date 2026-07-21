// Havola/fayl-manzil validatsiyasi — saqlanadigan XSS ga qarshi himoya testlari.
import { describe, it, expect } from "vitest";
import { externalUrl } from "./validation";
import { isHandoutRelPath } from "./handout-docs";
import { isAllowedMime, isImageMime } from "./receipts";
import { isAllowedHandoutMime } from "./handout-docs";
import { USTA_STATUS } from "./constants";

describe("externalUrl", () => {
  it("http/https qabul qilinadi", () => {
    expect(externalUrl.safeParse("https://maps.google.com/?q=41.3,69.2").success).toBe(true);
    expect(externalUrl.safeParse("http://example.uz/joy").success).toBe(true);
  });

  it("HUJUM: javascript: rad etiladi", () => {
    const r = externalUrl.safeParse("javascript:fetch('/api/export/clients')");
    expect(r.success).toBe(false);
  });

  it("HUJUM: katta-kichik harf va bo'shliq bilan yashirilgan javascript: ham rad etiladi", () => {
    expect(externalUrl.safeParse("JavaScript:alert(1)").success).toBe(false);
    expect(externalUrl.safeParse("  javascript:alert(1)  ").success).toBe(false);
    expect(externalUrl.safeParse("JAVASCRIPT:alert(1)").success).toBe(false);
  });

  it("HUJUM: data: va boshqa sxemalar rad etiladi", () => {
    expect(externalUrl.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(false);
    expect(externalUrl.safeParse("vbscript:msgbox(1)").success).toBe(false);
    expect(externalUrl.safeParse("file:///etc/passwd").success).toBe(false);
  });

  it("sxemasiz matn rad etiladi", () => {
    expect(externalUrl.safeParse("maps.google.com").success).toBe(false);
    expect(externalUrl.safeParse("").success).toBe(false);
  });

  it("juda uzun havola rad etiladi", () => {
    expect(externalUrl.safeParse("https://a.uz/" + "x".repeat(1100)).success).toBe(false);
  });
});

describe("isHandoutRelPath", () => {
  it("saveHandoutDoc qaytaradigan shakl qabul qilinadi", () => {
    expect(isHandoutRelPath("handouts/abc-123.pdf")).toBe(true);
    expect(isHandoutRelPath("handouts/9f2c.jpg")).toBe(true);
  });

  it("HUJUM: javascript:/tashqi manzil rad etiladi", () => {
    expect(isHandoutRelPath("javascript:alert(1)")).toBe(false);
    expect(isHandoutRelPath("https://evil.tld/x.pdf")).toBe(false);
    expect(isHandoutRelPath("//evil.tld/x.pdf")).toBe(false);
  });

  it("HUJUM: path traversal rad etiladi", () => {
    expect(isHandoutRelPath("handouts/../../.env")).toBe(false);
    expect(isHandoutRelPath("../handouts/a.pdf")).toBe(false);
  });

  it("boshqa kengaytma va papka rad etiladi", () => {
    expect(isHandoutRelPath("handouts/a.exe")).toBe(false);
    expect(isHandoutRelPath("receipts/a.pdf")).toBe(false);
    expect(isHandoutRelPath("handouts/sub/a.pdf")).toBe(false);
  });
});

describe("MIME allowlist — prototip kalitlari o'tmasligi kerak", () => {
  // `mime in MIME_EXT` ishlatilganda bular TRUE qaytarardi.
  const protoKeys = ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"];

  it("receipts: prototip kalitlari rad etiladi", () => {
    for (const k of protoKeys) {
      expect(isAllowedMime(k), k).toBe(false);
      expect(isImageMime(k), k).toBe(false);
    }
  });

  it("handout: prototip kalitlari rad etiladi", () => {
    for (const k of protoKeys) expect(isAllowedHandoutMime(k), k).toBe(false);
  });

  it("haqiqiy MIME'lar hamon ishlaydi", () => {
    expect(isAllowedMime("image/jpeg")).toBe(true);
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isAllowedHandoutMime("application/pdf")).toBe(true);
    expect(isAllowedHandoutMime("image/webp")).toBe(false);
  });
});

describe("USTA_STATUS allowlist", () => {
  it("prototip kalitlari holat sifatida qabul qilinmaydi", () => {
    for (const k of ["constructor", "toString", "__proto__"]) {
      expect(Object.hasOwn(USTA_STATUS, k), k).toBe(false);
    }
  });
  it("haqiqiy holat qabul qilinadi", () => {
    expect(Object.hasOwn(USTA_STATUS, "DONE")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { encryptBackup, decryptBackup, backupEncryptionEnabled } from "./backup-crypto";

const KEY = "juda-maxfiy-backup-kaliti-2026";

describe("backup shifrlash", () => {
  it("shifrlab, keyin ochib bo'ladi (round-trip)", () => {
    const data = Buffer.from("PGDMP fake dump content — mijozlar bazasi", "utf8");
    const enc = encryptBackup(data, KEY);
    expect(decryptBackup(enc, KEY).equals(data)).toBe(true);
  });

  it("shifrlangan blob ochiq matnni SAQLAMAYDI", () => {
    const secret = "Telefon: 998901234567";
    const enc = encryptBackup(Buffer.from(secret, "utf8"), KEY);
    expect(enc.toString("utf8")).not.toContain("998901234567");
    expect(enc.toString("utf8")).not.toContain("Telefon");
  });

  it("noto'g'ri kalit bilan ochilmaydi", () => {
    const enc = encryptBackup(Buffer.from("maxfiy"), KEY);
    expect(() => decryptBackup(enc, "boshqa-kalit-1234567890")).toThrow();
  });

  it("buzilgan fayl aniqlanadi (GCM butunlik tekshiruvi)", () => {
    const enc = encryptBackup(Buffer.from("maxfiy ma'lumot"), KEY);
    enc[enc.length - 1] ^= 0xff; // bitta baytni o'zgartiramiz
    expect(() => decryptBackup(enc, KEY)).toThrow();
  });

  it("begona fayl rad etiladi (magic yo'q)", () => {
    expect(() => decryptBackup(Buffer.from("shunchaki matn"), KEY)).toThrow(/magic/i);
  });

  it("har safar boshqa shifrmatn (salt/iv tasodifiy)", () => {
    const data = Buffer.from("bir xil kirish");
    const a = encryptBackup(data, KEY);
    const b = encryptBackup(data, KEY);
    expect(a.equals(b)).toBe(false);
    // lekin ikkalasi ham to'g'ri ochiladi
    expect(decryptBackup(a, KEY).equals(data)).toBe(true);
    expect(decryptBackup(b, KEY).equals(data)).toBe(true);
  });

  it("kalit yo'q yoki juda qisqa bo'lsa — shifrlash o'chiq", () => {
    expect(backupEncryptionEnabled(undefined)).toBe(false);
    expect(backupEncryptionEnabled("")).toBe(false);
    expect(backupEncryptionEnabled("qisqa")).toBe(false);
    expect(backupEncryptionEnabled(KEY)).toBe(true);
    expect(() => encryptBackup(Buffer.from("x"), "qisqa")).toThrow();
  });
});

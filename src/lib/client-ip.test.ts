import { describe, it, expect } from "vitest";
import { clientIp, trustedHops } from "./client-ip";

describe("clientIp", () => {
  it("sarlavha yo'q — local", () => {
    expect(clientIp(null)).toBe("local");
    expect(clientIp(undefined)).toBe("local");
    expect(clientIp("")).toBe("local");
    expect(clientIp("  ,  ")).toBe("local");
  });

  it("bitta IP — o'sha qaytadi", () => {
    expect(clientIp("203.0.113.5", 1)).toBe("203.0.113.5");
  });

  it("HUJUM: mijoz soxta IP qo'shsa — proksi yozgani olinadi, soxtasi emas", () => {
    // Mijoz "1.2.3.4" yubordi, Caddy o'zi ko'rgan haqiqiy IP'ni qo'shdi.
    expect(clientIp("1.2.3.4, 203.0.113.5", 1)).toBe("203.0.113.5");
    // Bir nechta soxta qiymat ham natijani o'zgartirmaydi.
    expect(clientIp("a, b, c, 203.0.113.5", 1)).toBe("203.0.113.5");
  });

  it("soxta qiymat har safar o'zgarsa ham natija BIR XIL qoladi (rate-limit ishlaydi)", () => {
    const real = "203.0.113.5";
    const forged = ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((f) => clientIp(`${f}, ${real}`, 1));
    expect(new Set(forged).size).toBe(1);
    expect(forged[0]).toBe(real);
  });

  it("ikki ishonchli proksi — o'ngdan ikkinchisi", () => {
    expect(clientIp("1.2.3.4, 203.0.113.5, 10.0.0.1", 2)).toBe("203.0.113.5");
  });

  it("ro'yxat kalta bo'lsa — eng chapdagi (indeks manfiy bo'lmaydi)", () => {
    expect(clientIp("203.0.113.5", 3)).toBe("203.0.113.5");
  });

  it("bo'shliqlar tozalanadi", () => {
    expect(clientIp("  1.2.3.4 ,   203.0.113.5  ", 1)).toBe("203.0.113.5");
  });
});

describe("trustedHops", () => {
  it("default 1", () => {
    expect(trustedHops(undefined)).toBe(1);
  });
  it("sonni o'qiydi", () => {
    expect(trustedHops("2")).toBe(2);
  });
  it("noto'g'ri/xavfli qiymat — 1 ga qaytadi", () => {
    expect(trustedHops("0")).toBe(1);
    expect(trustedHops("-5")).toBe(1);
    expect(trustedHops("abc")).toBe(1);
  });
});

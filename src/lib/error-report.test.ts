import { describe, it, expect } from "vitest";
import {
  formatErrorReport,
  shouldSend,
  isBenignStreamAbort,
  isBenignNotFoundFormDataError,
  errorSeverity,
  criticalChannelId,
  errorsChannelId,
} from "./error-report";

const now = new Date("2026-06-26T09:30:00Z");

describe("formatErrorReport", () => {
  it("xato nomi va xabarini o'z ichiga oladi", () => {
    const msg = formatErrorReport(new Error("baza yiqildi"), { source: "server" }, now);
    expect(msg).toContain("Xatolik");
    expect(msg).toContain("Error");
    expect(msg).toContain("baza yiqildi");
  });

  it("kontekst (manba/yo'l/metod) ni qo'shadi", () => {
    const msg = formatErrorReport(new Error("x"), {
      source: "server",
      path: "/lidlar",
      method: "POST",
      routeType: "action",
    }, now);
    expect(msg).toContain("/lidlar");
    expect(msg).toContain("action");
    expect(msg).toContain("POST");
  });

  it("so'rov-ID (requestId) berilsa xabarga qo'shadi", () => {
    const msg = formatErrorReport(new Error("x"), { requestId: "abc-123" }, now);
    expect(msg).toContain("abc-123");
  });

  it("HTML maxsus belgilarni ekranlaydi (injection himoyasi)", () => {
    const msg = formatErrorReport(new Error("<script>alert(1)</script>"), {}, now);
    expect(msg).not.toContain("<script>");
    expect(msg).toContain("&lt;script&gt;");
  });

  it("Error bo'lmagan qiymatni ham qabul qiladi", () => {
    const msg = formatErrorReport("oddiy satr xato", {}, now);
    expect(msg).toContain("oddiy satr xato");
  });

  it("juda uzun xabarni qisqartiradi", () => {
    const long = "a".repeat(5000);
    const msg = formatErrorReport(new Error(long), {}, now);
    expect(msg.length).toBeLessThan(3000);
  });
});

describe("shouldSend — spam himoyasi (throttle)", () => {
  it("birinchi marta true, oraliq ichida takror false", () => {
    const sig = "sig-A";
    expect(shouldSend(sig, 1_000, 60_000)).toBe(true);
    expect(shouldSend(sig, 5_000, 60_000)).toBe(false); // 4s o'tdi < 60s
  });

  it("oraliqdan keyin yana true", () => {
    const sig = "sig-B";
    expect(shouldSend(sig, 1_000, 60_000)).toBe(true);
    expect(shouldSend(sig, 70_000, 60_000)).toBe(true); // 69s o'tdi > 60s
  });

  it("har xil signature mustaqil", () => {
    expect(shouldSend("sig-C", 1_000, 60_000)).toBe(true);
    expect(shouldSend("sig-D", 1_000, 60_000)).toBe(true);
  });
});

describe("isBenignStreamAbort — streaming uzilish shovqinini filtrlash", () => {
  it("Node webstreams transformAlgorithm race'ni zararsiz deb biladi", () => {
    const err = new TypeError(
      "controller[kState].transformAlgorithm is not a function",
    );
    expect(isBenignStreamAbort(err)).toBe(true);
  });

  it("stream 'Invalid state' xatolarini ham filtrlaydi", () => {
    expect(isBenignStreamAbort(new TypeError("Invalid state: Controller is already closed"))).toBe(true);
  });

  it("oddiy (haqiqiy) xatoni filtrlamaydi", () => {
    expect(isBenignStreamAbort(new Error("baza yiqildi"))).toBe(false);
    expect(isBenignStreamAbort(null)).toBe(false);
    expect(isBenignStreamAbort("satr")).toBe(false);
  });
});

describe("isBenignNotFoundFormDataError — 404'ga uzilgan multipart shovqinini filtrlash", () => {
  it("/_not-found ga kelgan FormData xatosini zararsiz deb biladi", () => {
    const err = new TypeError("Failed to parse body as FormData.");
    expect(isBenignNotFoundFormDataError(err, { path: "/_not-found/page" })).toBe(true);
  });

  it("haqiqiy sahifadagi xuddi shu xabarni filtrlamaydi", () => {
    const err = new TypeError("Failed to parse body as FormData.");
    expect(isBenignNotFoundFormDataError(err, { path: "/malumotlar" })).toBe(false);
  });

  it("/_not-found bo'lsa ham boshqa xabarni filtrlamaydi", () => {
    expect(isBenignNotFoundFormDataError(new Error("baza yiqildi"), { path: "/_not-found/page" })).toBe(
      false,
    );
  });

  it("path bo'lmasa filtrlamaydi", () => {
    expect(isBenignNotFoundFormDataError(new TypeError("Failed to parse body as FormData."), {})).toBe(
      false,
    );
  });
});

describe("errorSeverity", () => {
  it("infratuzilma xabarlari — kritik", () => {
    expect(errorSeverity(new Error("could not extend file: No space left on device"))).toBe(
      "critical",
    );
    expect(errorSeverity(new Error("FATAL: the database system is in recovery mode"))).toBe(
      "critical",
    );
    expect(errorSeverity(new Error("JavaScript heap out of memory"))).toBe("critical");
    expect(errorSeverity(new Error("connect ECONNREFUSED 172.18.0.2:5432"))).toBe("critical");
  });

  it("fon ishi (worker) yiqilsa — kritik (ish bajarilmagan)", () => {
    expect(errorSeverity(new Error("nimadir"), { source: "worker", path: "distribute" })).toBe(
      "critical",
    );
  });

  it("to'lov/backup yo'llari — kritik", () => {
    expect(errorSeverity(new Error("x"), { path: "backup" })).toBe("critical");
    expect(errorSeverity(new Error("x"), { path: "/tolovlar" })).toBe("critical");
    expect(errorSeverity(new Error("x"), { source: "server", path: "/api/card-receipts/1" })).toBe(
      "critical",
    );
  });

  it("oddiy sahifa xatosi — kritik EMAS", () => {
    expect(errorSeverity(new Error("Mijoz topilmadi"), { source: "server", path: "/lidlar" })).toBe(
      "normal",
    );
    expect(errorSeverity(new Error("x"), {})).toBe("normal");
    expect(errorSeverity(null)).toBe("normal");
  });
});

describe("kritik xato ko'rinishi", () => {
  it("sarlavha va ogohlantirish qatori ajralib turadi", () => {
    const msg = formatErrorReport(new Error("No space left on device"), { source: "worker" }, now);
    expect(msg).toContain("KRITIK");
    expect(msg).toContain("Darhol tekshiring");
  });

  it("oddiy xatoda kritik belgilari yo'q", () => {
    const msg = formatErrorReport(new Error("Mijoz topilmadi"), { source: "server" }, now);
    expect(msg).not.toContain("KRITIK");
    expect(msg).not.toContain("Darhol tekshiring");
  });
});

describe("criticalChannelId", () => {
  it("alohida kanal sozlansa — o'sha kanal", () => {
    process.env.TELEGRAM_ERRORS_CRITICAL_CHANNEL_ID = "-100777";
    process.env.TELEGRAM_ERRORS_CHANNEL_ID = "-100111";
    expect(criticalChannelId()).toBe("-100777");
    delete process.env.TELEGRAM_ERRORS_CRITICAL_CHANNEL_ID;
  });

  it("sozlanmasa — oddiy xato kanaliga tushadi", () => {
    delete process.env.TELEGRAM_ERRORS_CRITICAL_CHANNEL_ID;
    process.env.TELEGRAM_ERRORS_CHANNEL_ID = "-100111";
    expect(criticalChannelId()).toBe(errorsChannelId());
    expect(criticalChannelId()).toBe("-100111");
  });
});

describe("shouldSend oynasi", () => {
  it("oddiy xatolar uzunroq oynada bir marta chiqadi", () => {
    const t = 1_000_000;
    expect(shouldSend("oddiy-xato", t, 15 * 60_000)).toBe(true);
    expect(shouldSend("oddiy-xato", t + 5 * 60_000, 15 * 60_000)).toBe(false);
    expect(shouldSend("oddiy-xato", t + 16 * 60_000, 15 * 60_000)).toBe(true);
  });
});

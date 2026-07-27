// TP Automation — Telegram worker.
// Ishga tushirish:  npm run bot
// Qo'lda hisobot:   npm run bot -- --send daily|weekly|monthly
//
// Bu jarayon Next.js'dan ALOHIDA ishlaydi (long-polling + cron uchun uzluksiz).
import "dotenv/config";
import { writeFileSync } from "fs";
import cron from "node-cron";
import { db } from "../src/lib/db";
import { sendToChannel, sendAlbumToChannel, telegramEnabled, channelId } from "../src/lib/telegram";
import { buildReport, buildReportAlbum, type ReportKind, startOfTzDay } from "../src/lib/reports";
import { createBackup } from "../src/lib/backup";
import { startBot } from "../src/lib/bot";
import { sendDailyReminders, sendOperatorReminders } from "../src/lib/reminders";
import { distributeLeadsCore } from "../src/lib/leads-distribution";
import { runSlaCheck } from "../src/lib/sla";
import { reportError } from "../src/lib/error-report";
import { withDbJobRetry } from "../src/lib/db-retry";
import { getDiskUsage, isDiskLow, diskWarning } from "../src/lib/disk";

const TZ = "Asia/Tashkent";

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

/**
 * Cron ishini o'tkinchi DB uzilishiga chidamli qiladi: postgres halokatdan
 * tiklanayotgan bo'lsa (masalan OOM'dan keyin) ish yo'qolmasin — ~1 daqiqagacha
 * kutib qayta uriniladi.
 */
function withRetry<T>(job: string, fn: () => Promise<T>): Promise<T> {
  return withDbJobRetry(fn, (attempt, delay, err) =>
    log(
      `${job}: baza javob bermadi (${err instanceof Error ? err.message.split("\n")[0] : err})` +
        ` — ${delay}ms dan keyin qayta urinish #${attempt}`,
    ),
  );
}

/** Hisobot albomini quradi va kanalga yuboradi; xato bo'lsa matnga qaytadi. */
async function sendReport(kind: ReportKind) {
  try {
    const album = await withRetry(`hisobot[${kind}]`, () => buildReportAlbum(kind));
    const res = await sendAlbumToChannel(album.images);
    if (res.ok) {
      log(`hisobot[${kind}] albom →`, res.mode, `${album.images.length} rasm, ok`);
      return;
    }
    // Albom xato — matnli zaxira
    const t = await sendToChannel(await buildReport(kind));
    log(`hisobot[${kind}] albom xato (${res.error}) → matn`, t.mode, t.ok ? "ok" : t.error);
  } catch (e) {
    log(`hisobot[${kind}] render xato:`, e instanceof Error ? e.message : e, "→ matn");
    try {
      const t = await sendToChannel(await buildReport(kind));
      log(`hisobot[${kind}] matn →`, t.mode, t.ok ? "ok" : t.error);
    } catch (e2) {
      log(`hisobot[${kind}] matn ham XATO:`, e2 instanceof Error ? e2.message : e2);
      await reportError(e2, { source: "worker", path: `report/${kind}`, notifyTransient: true });
    }
  }
}

/** Kunlik backup: DB + cheklar nusxasi + Telegram zaxira kanaliga. */
async function runBackup() {
  try {
    const res = await withRetry("backup", () => createBackup());
    if (res.ok) log(`backup → ${res.name} · ${res.sizeKb}KB · cheklar:${res.receipts} · Telegram:${res.telegram}`);
    else {
      log("backup XATO:", res.error);
      await reportError(new Error(res.error ?? "backup muvaffaqiyatsiz"), { source: "worker", path: "backup", notifyTransient: true });
    }
  } catch (e) {
    log("backup XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "backup", notifyTransient: true });
  }
}

/** Kunlik random taqsimot: muddati kelgan lidlarni operatorlarga tasodifiy ulashadi. */
async function runDistribute() {
  try {
    const r = await withRetry("taqsimot", () => distributeLeadsCore());
    if (r.error) log("taqsimot:", r.error);
    else log(`taqsimot → ${r.assigned} mijoz ${r.operators} operatorga`);
  } catch (e) {
    log("taqsimot XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "distribute", notifyTransient: true });
  }
}

/** Kunlik eslatmalar: operatorlarga qayta-aloqa+qarzdorlik, boshliqqa umumiy holat. */
async function runReminders(operatorsOnly = false) {
  try {
    if (operatorsOnly) {
      const o = await withRetry("eslatma[operator]", () => sendOperatorReminders());
      log(`eslatma[operator] → yuborildi:${o.sent} o'tkazildi:${o.skipped} telegramsiz:${o.noTelegram}`);
    } else {
      const r = await withRetry("eslatma[kunlik]", () => sendDailyReminders());
      log(
        `eslatma[kunlik] → operator yuborildi:${r.operators.sent} telegramsiz:${r.operators.noTelegram}` +
          ` · boshliq:${r.managers.sent} (${r.managers.mode})`,
      );
    }
  } catch (e) {
    log("eslatma XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "reminders", notifyTransient: true });
  }
}

/** 3-kunlik SLA tekshiruvi: hal bo'lmagan muammo/eskalatsiyalar bo'yicha ogohlantirish. */
async function runSla() {
  try {
    const r = await withRetry("SLA", () => runSlaCheck());
    log(`SLA → muammo:${r.tickets} eskalatsiya:${r.escalations} taklif:${r.suggestions} ogohlantirildi`);
  } catch (e) {
    log("SLA XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "sla", notifyTransient: true });
  }
}

/**
 * Kunlik disk tekshiruvi. Disk to'lganda postgres WAL yozolmay halokatga
 * uchraydi ("the database system is in recovery mode") va butun tizim to'xtaydi
 * — 2026-07-26/27 hodisasi aynan shunday bo'lgan. Shu sabab joy tugashidan
 * OLDIN ogohlantiramiz.
 */
async function runDiskCheck() {
  try {
    const u = await getDiskUsage();
    if (!u) return;
    log(`disk → ${u.freeGb}GB bo'sh / ${u.totalGb}GB (band ${u.usedPct}%)`);
    if (isDiskLow(u)) {
      await reportError(new Error(diskWarning(u)), {
        source: "worker",
        path: "disk",
        notifyTransient: true,
      });
    }
  } catch (e) {
    log("disk tekshiruvi XATO:", e instanceof Error ? e.message : e);
  }
}

/** 00:00 kun yangilanishi: muddati o'tgan 1-kunlik lid grantlarini tozalaydi. */
async function dailyRollover() {
  try {
    const todayStart = startOfTzDay(0);
    const removed = await withRetry("kun yangilanishi", () =>
      db.dailyLeadGrant.deleteMany({ where: { date: { lt: todayStart } } }),
    );
    log(`kun yangilandi — eski grantlar o'chirildi: ${removed.count}`);
  } catch (e) {
    log("kun yangilanishi XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "rollover", notifyTransient: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const sendIdx = argv.indexOf("--send");
  if (sendIdx !== -1) {
    const kind = (argv[sendIdx + 1] as ReportKind) || "daily";
    log(`Qo'lda yuborish: ${kind}`);
    await sendReport(kind);
    await db.$disconnect();
    return;
  }

  if (argv.includes("--backup")) {
    log("Qo'lda backup");
    await runBackup();
    await db.$disconnect();
    return;
  }

  if (argv.includes("--remind")) {
    log("Qo'lda eslatma");
    await runReminders(argv.includes("--operators"));
    await db.$disconnect();
    return;
  }

  if (argv.includes("--distribute")) {
    log("Qo'lda taqsimot");
    await runDistribute();
    await db.$disconnect();
    return;
  }

  if (argv.includes("--sla")) {
    log("Qo'lda SLA tekshiruvi");
    await runSla();
    await db.$disconnect();
    return;
  }

  log("Worker ishga tushdi.");
  log("Telegram:", telegramEnabled() ? "token bor" : "TOKEN YO'Q", "· kanal:", channelId() ?? "yo'q (log rejimi)");

  // Rejalashtirilgan hisobotlar (Asia/Tashkent)
  cron.schedule("30 17 * * *", () => sendReport("daily"), { timezone: TZ });
  cron.schedule("0 9 * * 1", () => sendReport("weekly"), { timezone: TZ });
  cron.schedule("0 9 1 * *", () => sendReport("monthly"), { timezone: TZ });
  cron.schedule("0 0 * * *", () => dailyRollover(), { timezone: TZ });
  cron.schedule("0 3 * * *", () => runBackup(), { timezone: TZ });
  // Eslatmalar: ertalab to'liq (operator + boshliq), tushdan keyin operatorlarga eslatish
  cron.schedule("30 9 * * *", () => runReminders(false), { timezone: TZ });
  cron.schedule("0 15 * * *", () => runReminders(true), { timezone: TZ });
  // Kunlik random taqsimot — ish boshlanishidan oldin (08:00)
  cron.schedule("0 8 * * *", () => runDistribute(), { timezone: TZ });
  // 3-kunlik SLA ogohlantirishi — har kuni 10:00
  cron.schedule("0 10 * * *", () => runSla(), { timezone: TZ });
  // Disk bo'sh joyi — ish kuni boshlanishidan oldin (07:00) va startda bir marta
  cron.schedule("0 7 * * *", () => runDiskCheck(), { timezone: TZ });
  log("Cron jadvallari o'rnatildi: disk 07:00, taqsimot 08:00, eslatma 09:30 & 15:00, SLA 10:00, kunlik 17:30, haftalik Dush 09:00, oylik 1-kun 09:00, yangilanish 00:00, backup 03:00");
  void runDiskCheck();

  // Liveness heartbeat — Docker healthcheck shu faylning yangiligini tekshiradi.
  // .unref(): heartbeat o'zi o'lik jarayonni tirik ushlab turmasin (soxta-healthy'ni oldini oladi).
  const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || "/tmp/tp-worker-heartbeat";
  const beat = () => {
    try {
      writeFileSync(HEARTBEAT_FILE, String(Date.now()));
    } catch {
      // yozib bo'lmasa — healthcheck faylni eskirgan deb ko'radi (kutilgan holat)
    }
  };
  beat();
  setInterval(beat, 30_000).unref();

  // Telegram bot (interaktiv menyu) — token bo'lsa
  await startBot();
}

main().catch(async (e) => {
  console.error("Worker halokati:", e);
  try {
    await reportError(e, { source: "worker", path: "main/startup", notifyTransient: true });
  } catch {
    // xato qayd etishning o'zi xato bersa — e'tiborsiz
  }
  process.exit(1);
});

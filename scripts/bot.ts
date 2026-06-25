// TP Automation — Telegram worker.
// Ishga tushirish:  npm run bot
// Qo'lda hisobot:   npm run bot -- --send daily|weekly|monthly
//
// Bu jarayon Next.js'dan ALOHIDA ishlaydi (long-polling + cron uchun uzluksiz).
import "dotenv/config";
import cron from "node-cron";
import { db } from "../src/lib/db";
import { sendToChannel, sendAlbumToChannel, telegramEnabled, channelId } from "../src/lib/telegram";
import { buildReport, buildReportAlbum, type ReportKind, startOfTzDay } from "../src/lib/reports";
import { createBackup } from "../src/lib/backup";
import { startBot } from "../src/lib/bot";
import { sendDailyReminders, sendOperatorReminders } from "../src/lib/reminders";
import { distributeLeadsCore } from "../src/lib/leads-distribution";

const TZ = "Asia/Tashkent";

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

/** Hisobot albomini quradi va kanalga yuboradi; xato bo'lsa matnga qaytadi. */
async function sendReport(kind: ReportKind) {
  try {
    const album = await buildReportAlbum(kind);
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
    }
  }
}

/** Kunlik backup: DB + cheklar nusxasi + Telegram zaxira kanaliga. */
async function runBackup() {
  try {
    const res = await createBackup();
    if (res.ok) log(`backup → ${res.name} · ${res.sizeKb}KB · cheklar:${res.receipts} · Telegram:${res.telegram}`);
    else log("backup XATO:", res.error);
  } catch (e) {
    log("backup XATO:", e instanceof Error ? e.message : e);
  }
}

/** Kunlik random taqsimot: muddati kelgan lidlarni operatorlarga tasodifiy ulashadi. */
async function runDistribute() {
  try {
    const r = await distributeLeadsCore();
    if (r.error) log("taqsimot:", r.error);
    else log(`taqsimot → ${r.assigned} mijoz ${r.operators} operatorga`);
  } catch (e) {
    log("taqsimot XATO:", e instanceof Error ? e.message : e);
  }
}

/** Kunlik eslatmalar: operatorlarga qayta-aloqa+qarzdorlik, boshliqqa umumiy holat. */
async function runReminders(operatorsOnly = false) {
  try {
    if (operatorsOnly) {
      const o = await sendOperatorReminders();
      log(`eslatma[operator] → yuborildi:${o.sent} o'tkazildi:${o.skipped} telegramsiz:${o.noTelegram}`);
    } else {
      const r = await sendDailyReminders();
      log(
        `eslatma[kunlik] → operator yuborildi:${r.operators.sent} telegramsiz:${r.operators.noTelegram}` +
          ` · boshliq:${r.managers.sent} (${r.managers.mode})`,
      );
    }
  } catch (e) {
    log("eslatma XATO:", e instanceof Error ? e.message : e);
  }
}

/** 00:00 kun yangilanishi: muddati o'tgan 1-kunlik lid grantlarini tozalaydi. */
async function dailyRollover() {
  try {
    const todayStart = startOfTzDay(0);
    const removed = await db.dailyLeadGrant.deleteMany({
      where: { date: { lt: todayStart } },
    });
    log(`kun yangilandi — eski grantlar o'chirildi: ${removed.count}`);
  } catch (e) {
    log("kun yangilanishi XATO:", e instanceof Error ? e.message : e);
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

  log("Worker ishga tushdi.");
  log("Telegram:", telegramEnabled() ? "token bor" : "TOKEN YO'Q", "· kanal:", channelId() ?? "yo'q (log rejimi)");

  // Rejalashtirilgan hisobotlar (Asia/Tashkent)
  cron.schedule("30 18 * * *", () => sendReport("daily"), { timezone: TZ });
  cron.schedule("0 9 * * 1", () => sendReport("weekly"), { timezone: TZ });
  cron.schedule("0 9 1 * *", () => sendReport("monthly"), { timezone: TZ });
  cron.schedule("0 0 * * *", () => dailyRollover(), { timezone: TZ });
  cron.schedule("0 3 * * *", () => runBackup(), { timezone: TZ });
  // Eslatmalar: ertalab to'liq (operator + boshliq), tushdan keyin operatorlarga eslatish
  cron.schedule("30 9 * * *", () => runReminders(false), { timezone: TZ });
  cron.schedule("0 15 * * *", () => runReminders(true), { timezone: TZ });
  // Kunlik random taqsimot — ish boshlanishidan oldin (08:00)
  cron.schedule("0 8 * * *", () => runDistribute(), { timezone: TZ });
  log("Cron jadvallari o'rnatildi: taqsimot 08:00, eslatma 09:30 & 15:00, kunlik 18:30, haftalik Dush 09:00, oylik 1-kun 09:00, yangilanish 00:00, backup 03:00");

  // Telegram bot (interaktiv menyu) — token bo'lsa
  await startBot();
}

main().catch((e) => {
  console.error("Worker halokati:", e);
  process.exit(1);
});

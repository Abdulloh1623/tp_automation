// TP Automation — Telegram worker.
// Ishga tushirish:  npm run bot
// Qo'lda hisobot:   npm run bot -- --send daily|weekly|monthly
//
// Bu jarayon Next.js'dan ALOHIDA ishlaydi (long-polling + cron uchun uzluksiz).
import "dotenv/config";
import { writeFileSync } from "fs";
import cron from "node-cron";
import { db } from "../src/lib/db";
import { sendToChannel, sendAlbumToChannel, sendMessage, telegramEnabled, channelId } from "../src/lib/telegram";
import { buildReport, buildReportAlbum, type ReportKind, startOfTzDay } from "../src/lib/reports";
import { SHIFT_REPORT } from "../src/lib/constants";
import { createBackup } from "../src/lib/backup";
import { startBot } from "../src/lib/bot";
import { sendDailyReminders, sendOperatorReminders } from "../src/lib/reminders";
import { distributeLeadsCore } from "../src/lib/leads-distribution";
import { runSlaCheck } from "../src/lib/sla";
import { runSilentChurnCheck } from "../src/lib/silent-churn-alert";
import { syncBiznex, biznexConfigured } from "../src/lib/biznex-sync";
import { remindStaleCardRequests } from "../src/lib/card-payment";
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

/**
 * Kunlik taqsimot: muddati kelgan lidlarni smena operatorlariga ulashadi.
 * Smena berilmasa — barcha faol operatorlarga (qo'lda ishga tushirish uchun).
 */
async function runDistribute(shift?: "DAY" | "NIGHT") {
  const tag = shift ? `taqsimot[${shift}]` : "taqsimot";
  try {
    const r = await withRetry(tag, () => distributeLeadsCore(shift));
    if (r.error) {
      log(`${tag}:`, r.error);
      // Rejalashtirilgan (smenali) chaqiruvda jadval bo'sh bo'lsa — bu jimgina
      // o'tib ketmasin, admin ko'rmasa kunlik ro'yxat hech kimga bo'linmay qoladi.
      if (shift) await alertEmptyRoster(shift, r.error);
    } else
      log(
        `${tag} → ${r.assigned} mijoz ${r.operators} operatorga` +
          (r.released ? ` (tugagan smenadan olindi: ${r.released})` : ""),
      );
  } catch (e) {
    log(`${tag} XATO:`, e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "distribute", notifyTransient: true });
  }
}

/** Rejalashtirilgan taqsimot bo'sh jadval sababli ishlamasa — adminlarga DM. */
async function alertEmptyRoster(shift: "DAY" | "NIGHT", error: string) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true, telegramId: { not: null } },
    select: { telegramId: true },
  });
  const text = `⚠️ Kunlik taqsimot ishlamadi: ${error}`;
  if (admins.length === 0) {
    await sendToChannel(text);
    return;
  }
  for (const a of admins) {
    if (!a.telegramId) continue;
    try {
      await sendMessage(a.telegramId, text);
    } catch {
      /* eng yaxshi harakat */
    }
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
    log(
      `SLA → muammo:${r.tickets} eskalatsiya:${r.escalations} qaytarish:${r.returns} taklif:${r.suggestions} ogohlantirildi`,
    );
    // Javobsiz qolgan karta tasdiqlari — to'lov hisobga olinmay turibdi
    const cards = await withRetry("karta tasdig'i", () => remindStaleCardRequests());
    if (cards > 0) log(`karta tasdig'i → ${cards} ta so'rov eslatildi`);
  } catch (e) {
    log("SLA XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "sla", notifyTransient: true });
  }
}

/**
 * Biznex obuna holatini mijozlarga ko'chirish. Jim churn ro'yxati shu flaglarga
 * tayanadi, shuning uchun ogohlantirishdan OLDIN (06:00) yangilanadi.
 * Biznex sozlanmagan bo'lsa — jimgina o'tkazib yuboriladi (lokal/dev).
 */
async function runBiznexSync() {
  if (!biznexConfigured()) {
    log("biznex sinxronizatsiyasi → o'tkazildi (BIZNEX_API_URL/TOKEN yo'q)");
    return;
  }
  try {
    const r = await withRetry("biznex", () => syncBiznex());
    log(
      `biznex → ${r.checked} tekshirildi · ${r.updated} yangilandi · ` +
        `${r.notFound} topilmadi · ${r.skipped} o'tkazildi`,
    );
  } catch (e) {
    log("biznex XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "biznex-sync", notifyTransient: true });
  }
}

/**
 * Jim churn: Biznex obunasi tugagan, lekin CRM'da faol turgan mijozlar bo'yicha
 * boshliqlarga kunlik ogohlantirish (SLA kabi — bartaraf bo'lmaguncha har kuni).
 */
async function runSilentChurn() {
  try {
    const r = await withRetry("jim churn", () => runSilentChurnCheck());
    if (r.count === 0) log("jim churn → yo'q");
    else log(`jim churn → ${r.count} mijoz · boshliq:${r.notified} · Telegram:${r.telegram}`);
  } catch (e) {
    log("jim churn XATO:", e instanceof Error ? e.message : e);
    await reportError(e, { source: "worker", path: "silent-churn", notifyTransient: true });
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
    const kind = (argv[sendIdx + 1] as ReportKind) || "shift-day";
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
    // `--distribute --shift DAY|NIGHT` — smenaga; smenasiz barcha operatorlarga.
    const sIdx = argv.indexOf("--shift");
    const s = sIdx >= 0 ? argv[sIdx + 1] : undefined;
    const shift = s === "DAY" || s === "NIGHT" ? s : undefined;
    log("Qo'lda taqsimot", shift ?? "(barcha smenalar)");
    await runDistribute(shift);
    await db.$disconnect();
    return;
  }

  if (argv.includes("--sla")) {
    log("Qo'lda SLA tekshiruvi");
    await runSla();
    await db.$disconnect();
    return;
  }

  if (argv.includes("--biznex")) {
    log("Qo'lda Biznex sinxronizatsiyasi");
    await runBiznexSync();
    await db.$disconnect();
    return;
  }

  log("Worker ishga tushdi.");
  log("Telegram:", telegramEnabled() ? "token bor" : "TOKEN YO'Q", "· kanal:", channelId() ?? "yo'q (log rejimi)");

  // Rejalashtirilgan hisobotlar (Asia/Tashkent). Kunlik hisobot ikki smenaga
  // bo'lingan — vaqtlar `SHIFT_REPORT` dan olinadi (hisobot oynasi bilan bitta manba).
  cron.schedule(
    `${SHIFT_REPORT.DAY.sendMinute} ${SHIFT_REPORT.DAY.sendHour} * * *`,
    () => sendReport("shift-day"),
    { timezone: TZ },
  );
  cron.schedule(
    `${SHIFT_REPORT.NIGHT.sendMinute} ${SHIFT_REPORT.NIGHT.sendHour} * * *`,
    () => sendReport("shift-night"),
    { timezone: TZ },
  );
  cron.schedule("0 9 * * 1", () => sendReport("weekly"), { timezone: TZ });
  cron.schedule("0 9 1 * *", () => sendReport("monthly"), { timezone: TZ });
  cron.schedule("0 0 * * *", () => dailyRollover(), { timezone: TZ });
  cron.schedule("0 3 * * *", () => runBackup(), { timezone: TZ });
  // Eslatmalar: ertalab to'liq (operator + boshliq), tushdan keyin operatorlarga eslatish
  cron.schedule("30 9 * * *", () => runReminders(false), { timezone: TZ });
  cron.schedule("0 15 * * *", () => runReminders(true), { timezone: TZ });
  // Taqsimot smena boshlanishidan oldin: kunduzgi 08:00, kechki 18:00 — HAR
  // KUNI (yakshanba ham), chunki kim ishlashi endi ADMIN kunlik jadvalidan
  // (`DutyDay`, `/ish-jadvali`) olinadi — haftaning kuniga bog'liq maxsus
  // holat yo'q. Admin o'sha kunga jadval qo'ymagan bo'lsa, yadro shunchaki
  // "hech kim tayinlanmagan" xatosini qaytaradi (log'da ko'rinadi).
  //
  // Kechki taqsimotda kunduzgi smena ULGURMAGAN (tegilmagan) lidlar bo'shatilib
  // kechki smenaga o'tadi — kun oxirida ular yo'qolib qolmaydi.
  cron.schedule("0 8 * * *", () => runDistribute("DAY"), { timezone: TZ });
  cron.schedule("0 18 * * *", () => runDistribute("NIGHT"), { timezone: TZ });
  // 3-kunlik SLA ogohlantirishi — har kuni 10:00
  cron.schedule("0 10 * * *", () => runSla(), { timezone: TZ });
  // Biznex obuna flaglari — jim churn ogohlantirishidan oldin yangilansin (06:00)
  cron.schedule("0 6 * * *", () => runBiznexSync(), { timezone: TZ });
  // Jim churn — SLA'dan keyin (10:15), boshliqlar ish kunini boshlaganda
  cron.schedule("15 10 * * *", () => runSilentChurn(), { timezone: TZ });
  // Disk bo'sh joyi — ish kuni boshlanishidan oldin (07:00) va startda bir marta
  cron.schedule("0 7 * * *", () => runDiskCheck(), { timezone: TZ });
  log(
    "Cron jadvallari o'rnatildi: biznex 06:00, disk 07:00," +
      " taqsimot 08:00 (kunduzgi) & 18:00 (kechki) — Dush–Shan," +
      " eslatma 09:30 & 15:00, SLA 10:00, jim churn 10:15," +
      " kechki smena 09:30, kunduzgi smena 17:30, haftalik Dush 09:00, oylik 1-kun 09:00," +
      " yangilanish 00:00, backup 03:00",
  );
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

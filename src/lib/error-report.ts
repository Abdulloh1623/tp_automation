// Server xatolarini Telegram'ga yuborib, prod'da "ko'rinmas" xatolarning oldini oladi.
// onRequestError (instrumentation), worker (cron) va boshqa joylardan chaqiriladi.
import { botToken, sendMessage, escapeHtml, backupChannelId, channelId } from "./telegram";
import { isTransientDbError } from "./db-errors";
import { logger } from "./logger";

export type ErrorContext = {
  source?: string; // "server" | "worker" | "client" ...
  path?: string; // URL yo'li yoki job nomi
  method?: string;
  routeType?: string; // render | route | action | middleware
  requestId?: string; // so'rov-ID (x-request-id) — loglarni bog'lash uchun
  extra?: string;
  // O'tkinchi DB xatosi bo'lsa ham kanalga yuborilsin. Fon ishlari (cron) uchun:
  // qayta urinishlar tugagach ish UMUMAN bajarilmaydi (masalan kunlik taqsimot
  // o'tmay qoladi) — sabab "o'tkinchi" bo'lsa ham buni bilish kerak.
  notifyTransient?: boolean;
};

const TZ = "Asia/Tashkent";
// Bir xil xato shu oraliqda takror yuborilmaydi. Kritik xatolar tez-tez
// eslatilishi kerak, oddiylari esa kanalni ko'mib tashlamasligi kerak —
// shu sabab ikki xil oyna.
const WINDOW_MS = 60_000;
const NORMAL_WINDOW_MS = 15 * 60_000;

export type Severity = "critical" | "normal";

// Tizim ishlamay qolganini bildiruvchi xabarlar. Bular "shovqin" emas —
// odam aralashmasa tizim to'xtaydi (2026-07-26: disk to'lgani haqidagi
// `No space left on device` xatosi oddiy xatolar oqimida ko'zdan qochgan va
// ertasiga postgres halokatga uchragan).
const CRITICAL_MESSAGE_RE =
  /no space left on device|enospc|disk (is )?full|database system is (in recovery|starting up|shutting down)|can't reach database|too many clients already|connection (was |is )?(refused|reset)|econnrefused|out of memory|heap out of memory/i;

// Ish bajarilmay qolgan joylar: fon ishlari (cron), to'lov va zaxira oqimi.
const CRITICAL_PATH_RE =
  /^(backup|distribute|reminders|sla|rollover|disk|main\/startup)|payment|tolov|card/i;

/**
 * Xatoning muhimligi (sof funksiya — test qilinadi).
 *
 * KRITIK: infratuzilma yiqilgan (disk/baza/xotira) yoki rejalashtirilgan ish
 * BAJARILMAY qolgan — bunday xato albatta ko'rinishi kerak.
 * ODDIY: bitta so'rov/sahifa xatosi — foydalanuvchi qayta urinishi mumkin.
 */
export function errorSeverity(error: unknown, ctx: ErrorContext = {}): Severity {
  const e = error as { message?: unknown } | null;
  const msg = typeof e?.message === "string" ? e.message : "";
  if (CRITICAL_MESSAGE_RE.test(msg)) return "critical";
  // Worker — rejalashtirilgan ish; yiqilsa hech kim o'rniga bajarmaydi
  if (ctx.source === "worker") return "critical";
  if (ctx.path && CRITICAL_PATH_RE.test(ctx.path)) return "critical";
  return "normal";
}

/**
 * Streaming SSR (React 19) paytida mijoz ulanishni uzganda Node webstreams
 * qatlamida chiqadigan zararsiz race xatosimi? Javob oqimi allaqachon
 * uzilgan bo'ladi — foydalanuvchi ta'sirlanmaydi, shuning uchun xato kanaliga
 * yubormaymiz (Node 22.15+ da tuzatilgan, lekin himoya bo'lib qoladi).
 */
export function isBenignStreamAbort(error: unknown): boolean {
  const e = error as { message?: unknown } | null;
  const msg = typeof e?.message === "string" ? e.message : "";
  return /transformAlgorithm is not a function|Invalid state: (Controller|TransformStream|Writable|Readable)/i.test(
    msg,
  );
}

/**
 * Xato kanalini aniqlaydi: maxsus xato kanali → backup kanali → asosiy kanal.
 * Hech biri bo'lmasa null (faqat konsolga yoziladi).
 */
export function errorsChannelId(): string | null {
  return (
    process.env.TELEGRAM_ERRORS_CHANNEL_ID?.trim() ||
    backupChannelId() ||
    channelId() ||
    null
  );
}

/**
 * Kritik xatolar kanali. Alohida kanal sozlanmagan bo'lsa oddiy xato kanaliga
 * tushadi — bunday holda ular sarlavhadagi 🚨 belgisi bilan ajralib turadi.
 */
export function criticalChannelId(): string | null {
  return (
    process.env.TELEGRAM_ERRORS_CRITICAL_CHANNEL_ID?.trim() || errorsChannelId()
  );
}

function tashkentTime(now: Date): string {
  try {
    return new Intl.DateTimeFormat("uz-UZ", {
      timeZone: TZ,
      dateStyle: "short",
      timeStyle: "medium",
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

/** Xato xabarini Telegram HTML formatiga keltiradi (sof funksiya — test qilinadi). */
export function formatErrorReport(error: unknown, ctx: ErrorContext, now: Date): string {
  const e = error instanceof Error ? error : new Error(String(error));
  const where = [ctx.source, ctx.routeType, ctx.method, ctx.path].filter(Boolean).join(" · ");
  const stack = (e.stack ?? "").split("\n").slice(0, 6).join("\n");
  const critical = errorSeverity(error, ctx) === "critical";
  const lines = [
    critical
      ? "🚨 <b>KRITIK XATOLIK</b> — TP Automation"
      : "🔴 <b>Xatolik</b> — TP Automation",
    `🕒 ${escapeHtml(tashkentTime(now))}`,
    where ? `📍 ${escapeHtml(where)}` : null,
    ctx.requestId ? `🔗 ${escapeHtml(ctx.requestId)}` : null,
    `❗ <b>${escapeHtml(e.name)}</b>: ${escapeHtml(e.message.slice(0, 500))}`,
    ctx.extra ? `ℹ️ ${escapeHtml(ctx.extra.slice(0, 300))}` : null,
    // Kritik xato = tizim to'xtagan yoki ish bajarilmagan. Xabarni o'qigan odam
    // buni darhol bilishi kerak, aks holda u oddiy xatolar oqimida yo'qoladi.
    critical ? "⚠️ <b>Darhol tekshiring</b> — ish bajarilmagan bo'lishi mumkin." : null,
    stack ? `<pre>${escapeHtml(stack.slice(0, 1500))}</pre>` : null,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

// Bir xil xatoni qisqa oraliqda takror yubormaslik (spam himoyasi).
const lastSent = new Map<string, number>();

/** signature shu oraliqda yuborilmagan bo'lsa true (va vaqtni belgilaydi). */
export function shouldSend(signature: string, now: number, windowMs = WINDOW_MS): boolean {
  const prev = lastSent.get(signature);
  if (prev !== undefined && now - prev < windowMs) return false;
  lastSent.set(signature, now);
  if (lastSent.size > 200) {
    for (const [k, t] of lastSent) if (now - t > windowMs) lastSent.delete(k);
  }
  return true;
}

function signatureOf(error: unknown, ctx: ErrorContext): string {
  const e = error instanceof Error ? error : new Error(String(error));
  return `${ctx.source ?? ""}|${ctx.path ?? ""}|${e.name}|${e.message}`.slice(0, 200);
}

/**
 * Xatoni qayd etadi: doimo konsolga, imkon bo'lsa Telegram'ga ham.
 * Best-effort — HECH QACHON throw qilmaydi (xato qayd etish asosiy oqimni buzmasligi kerak).
 */
export async function reportError(error: unknown, ctx: ErrorContext = {}): Promise<void> {
  const e = error instanceof Error ? error : new Error(String(error));
  // Strukturalangan JSON log — har doim (Telegram yuborilmasa ham). requestId
  // orqali bu yozuvni o'sha so'rovning boshqa loglariga bog'lash mumkin.
  logger.error(
    {
      err: e,
      source: ctx.source,
      path: ctx.path,
      method: ctx.method,
      routeType: ctx.routeType,
      requestId: ctx.requestId,
      severity: errorSeverity(error, ctx),
    },
    "so'rov xatosi",
  );
  // O'tkinchi DB-ulanish uzilishi (deploy/restart) — bug emas, kanalga
  // yuborilmaydi (konsol izi yetarli). withDbRetry baribir qayta uriladi.
  if (isTransientDbError(error) && !ctx.notifyTransient) return;
  // Mijoz streaming render'ni yarmida uzganda chiqadigan zararsiz stream race —
  // kanalga yubormaymiz (soxta signal).
  if (isBenignStreamAbort(error)) return;
  try {
    // Dev/test xatolari kanalga ketmasin — Telegram faqat prod uchun
    if (process.env.NODE_ENV !== "production") return;
    if (!botToken()) return; // Telegram o'chiq — faqat konsol
    const now = Date.now();
    const critical = errorSeverity(error, ctx) === "critical";
    // Oddiy xatolar uzunroq oynada bir marta (kanal ko'milmasin), kritiklar —
    // tez-tez eslatiladi.
    if (!shouldSend(signatureOf(error, ctx), now, critical ? WINDOW_MS : NORMAL_WINDOW_MS)) {
      return;
    }
    const chat = critical ? criticalChannelId() : errorsChannelId();
    if (!chat) return;
    await sendMessage(chat, formatErrorReport(error, ctx, new Date(now)));
  } catch (sendErr) {
    logger.warn({ err: sendErr }, "xatoni Telegram'ga yuborib bo'lmadi");
  }
}

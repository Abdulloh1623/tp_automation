// Server xatolarini Telegram'ga yuborib, prod'da "ko'rinmas" xatolarning oldini oladi.
// onRequestError (instrumentation), worker (cron) va boshqa joylardan chaqiriladi.
import { botToken, sendMessage, escapeHtml, backupChannelId, channelId } from "./telegram";

export type ErrorContext = {
  source?: string; // "server" | "worker" | "client" ...
  path?: string; // URL yo'li yoki job nomi
  method?: string;
  routeType?: string; // render | route | action | middleware
  extra?: string;
};

const TZ = "Asia/Tashkent";
const WINDOW_MS = 60_000; // bir xil xato shu oraliqda takror yuborilmaydi

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
  const lines = [
    "🔴 <b>Xatolik</b> — TP Automation",
    `🕒 ${escapeHtml(tashkentTime(now))}`,
    where ? `📍 ${escapeHtml(where)}` : null,
    `❗ <b>${escapeHtml(e.name)}</b>: ${escapeHtml(e.message.slice(0, 500))}`,
    ctx.extra ? `ℹ️ ${escapeHtml(ctx.extra.slice(0, 300))}` : null,
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
  console.error(`[error-report] ${ctx.source ?? ""} ${ctx.path ?? ""}:`, e);
  try {
    if (!botToken()) return; // Telegram o'chiq — faqat konsol
    const now = Date.now();
    if (!shouldSend(signatureOf(error, ctx), now)) return; // spam himoyasi
    const chat = errorsChannelId();
    if (!chat) return;
    await sendMessage(chat, formatErrorReport(error, ctx, new Date(now)));
  } catch (sendErr) {
    console.error("[error-report] Telegram'ga yuborib bo'lmadi:", sendErr);
  }
}

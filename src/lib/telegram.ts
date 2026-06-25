// Telegram Bot API uchun yengil yordamchi (faqat fetch — Next.js va worker'da ishlaydi).

const API = "https://api.telegram.org";

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function channelId(): string | null {
  return process.env.TELEGRAM_CHANNEL_ID?.trim() || null;
}

export function paymentsChannelId(): string | null {
  return process.env.TELEGRAM_PAYMENTS_CHANNEL_ID?.trim() || null;
}

export function backupChannelId(): string | null {
  return process.env.TELEGRAM_BACKUP_CHANNEL_ID?.trim() || null;
}

export function telegramEnabled(): boolean {
  return !!botToken();
}

/** HTML parse_mode uchun maxsus belgilarni ekranlaydi. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type TgResult<T = unknown> = {
  ok: boolean;
  mode?: "live" | "log" | "disabled";
  result?: T;
  error?: string;
};

/** Bot API metodini chaqiradi. Token bo'lmasa — disabled. */
export async function callTelegram<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
): Promise<TgResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, mode: "disabled", error: "TELEGRAM_BOT_TOKEN yo'q" };

  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      return { ok: false, mode: "live", error: data.description ?? "Telegram xatosi" };
    }
    return { ok: true, mode: "live", result: data.result };
  } catch (e) {
    return { ok: false, mode: "live", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Berilgan chatga HTML xabar yuboradi. */
export async function sendMessage(
  chatId: string | number,
  text: string,
  extra?: Record<string, unknown>,
): Promise<TgResult> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

/**
 * Sozlangan kanalga xabar yuboradi.
 * Kanal IDsi bo'lmasa — konsolga yozadi (log rejimi), xato bermaydi.
 */
export async function sendToChannel(text: string): Promise<TgResult> {
  const chat = channelId();
  if (!chat) {
    console.log("[telegram:log-mode] (kanal IDsi yo'q) xabar:\n" + text + "\n");
    return { ok: true, mode: "log" };
  }
  return sendMessage(chat, text);
}

// --- Rasm (multipart) ---

/** Bot API metodini multipart/form-data bilan chaqiradi (fayl yuborish). */
async function callTelegramForm<T = unknown>(
  method: string,
  form: FormData,
): Promise<TgResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, mode: "disabled", error: "TELEGRAM_BOT_TOKEN yo'q" };
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, { method: "POST", body: form });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) return { ok: false, mode: "live", error: data.description ?? "Telegram xatosi" };
    return { ok: true, mode: "live", result: data.result };
  } catch (e) {
    return { ok: false, mode: "live", error: e instanceof Error ? e.message : String(e) };
  }
}

export type AlbumItem = { png: Buffer; caption?: string };

/** Bitta rasm yuboradi (HTML caption bilan). */
export async function sendPhoto(
  chatId: string | number,
  png: Buffer,
  caption?: string,
): Promise<TgResult> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "chart.png");
  return callTelegramForm("sendPhoto", form);
}

/** Rasmlar albomini yuboradi (2–10 ta). Caption birinchi rasmda. */
export async function sendMediaGroup(
  chatId: string | number,
  items: AlbumItem[],
): Promise<TgResult> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  const media = items.map((it, i) => ({
    type: "photo",
    media: `attach://file${i}`,
    ...(it.caption ? { caption: it.caption, parse_mode: "HTML" } : {}),
  }));
  form.append("media", JSON.stringify(media));
  items.forEach((it, i) => {
    form.append(`file${i}`, new Blob([new Uint8Array(it.png)], { type: "image/png" }), `${i}.png`);
  });
  return callTelegramForm("sendMediaGroup", form);
}

/**
 * Kanalga rasm albomi yuboradi. Kanal yo'q → log rejimi.
 * 1 ta rasm bo'lsa sendPhoto, ko'p bo'lsa sendMediaGroup.
 */
export async function sendAlbumToChannel(items: AlbumItem[]): Promise<TgResult> {
  const chat = channelId();
  if (items.length === 0) return { ok: false, error: "Rasm yo'q" };
  if (!chat) {
    const caps = items.map((i) => i.caption).filter(Boolean).join(" | ");
    console.log(`[telegram:log-mode] (kanal IDsi yo'q) albom: ${items.length} rasm. ${caps}`);
    return { ok: true, mode: "log" };
  }
  if (items.length === 1) return sendPhoto(chat, items[0].png, items[0].caption);
  return sendMediaGroup(chat, items);
}

/**
 * To'lovlar kanaliga yuboradi: chek rasmi bo'lsa rasm+caption, bo'lmasa matn.
 * Kanal yo'q → log rejimi.
 */
export async function sendPaymentToChannel(
  caption: string,
  png?: Buffer,
): Promise<TgResult> {
  const chat = paymentsChannelId();
  if (!chat) {
    console.log("[telegram:log-mode] (to'lovlar kanali yo'q) to'lov:\n" + caption + "\n");
    return { ok: true, mode: "log" };
  }
  if (png) {
    const res = await sendPhoto(chat, png, caption);
    if (res.ok) return res;
    // Rasm yuborilmasa (masalan buzuq fayl) — kamida matn ketsin
    return sendMessage(chat, caption);
  }
  return sendMessage(chat, caption);
}

/** Hujjat (fayl) yuboradi. */
export async function sendDocument(
  chatId: string | number,
  buffer: Buffer,
  filename: string,
  caption?: string,
): Promise<TgResult> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  form.append("document", new Blob([new Uint8Array(buffer)]), filename);
  return callTelegramForm("sendDocument", form);
}

/** Backup faylini zaxira kanaliga yuboradi. Kanal yo'q → skip (log). */
export async function sendBackupToChannel(
  buffer: Buffer,
  filename: string,
  caption?: string,
): Promise<TgResult> {
  const chat = backupChannelId();
  if (!chat) {
    console.log("[telegram:log-mode] (backup kanali yo'q):", filename);
    return { ok: true, mode: "log" };
  }
  return sendDocument(chat, buffer, filename, caption);
}

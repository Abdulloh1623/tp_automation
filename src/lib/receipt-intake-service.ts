// "To'lov cheklari" guruhidan kelgan cheklarni PendingPayment sifatida yozish.
//
// MUHIM: bu modul bot worker'ida (Next.js'siz) ishlaydi — shuning uchun
// `next/cache` yoki server action importlari BO'LMASIN.
//
// Juftlash muammosi: guruhda chek rasmi va mijoz matni ALOHIDA ikki xabar
// bo'lib keladi, tartibi ham turlicha (goh rasm oldin, goh matn). Shuning
// uchun bir yuboruvchidan kelgan xabarlarni qisqa vaqt oynasida juftlaymiz.

import { db } from "./db";
import { saveReceipt, isAllowedMime } from "./receipts";
import { downloadTelegramFile } from "./telegram";
import { parseReceiptText, matchClient, type ClientCandidate } from "./receipt-intake";

/** Matn va chek bir xabarga tegishli deb hisoblanadigan vaqt oynasi. */
const PAIR_WINDOW_MS = 5 * 60 * 1000;

/** Juftlashni kutayotgan matn: "chatId:senderId" -> matn + vaqt. */
type WaitingText = { text: string; at: number; senderName: string | null };
const waitingText = new Map<string, WaitingText>();

/** Matnsiz yozilgan oxirgi chek: "chatId:senderId" -> pendingPayment id + vaqt. */
const waitingReceipt = new Map<string, { id: string; at: number }>();

function key(chatId: string | number, senderId: string | number): string {
  return `${chatId}:${senderId}`;
}

/** Eskirgan yozuvlarni tozalaydi (xotira cheksiz o'smasin). */
function sweep(now: number): void {
  for (const [k, v] of waitingText) if (now - v.at > PAIR_WINDOW_MS) waitingText.delete(k);
  for (const [k, v] of waitingReceipt) if (now - v.at > PAIR_WINDOW_MS) waitingReceipt.delete(k);
}

/** Mijozni telefon bo'yicha topish uchun nomzodlar (telefon + qo'shimchalari). */
async function loadCandidates(): Promise<ClientCandidate[]> {
  const rows = await db.client.findMany({
    select: {
      id: true,
      phone: true,
      restaurantName: true,
      contractNumber: true,
      phones: { select: { number: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    phone: c.phone,
    restaurantName: c.restaurantName,
    contractNumber: c.contractNumber,
    extraPhones: c.phones.map((p) => p.number),
  }));
}

/** Matndan mijozni aniqlab, PendingPayment maydonlarini tayyorlaydi. */
async function fieldsFromText(text: string) {
  const parsed = parseReceiptText(text);
  const match = matchClient(parsed, await loadCandidates());
  return {
    rawText: text,
    parsedName: parsed.name,
    parsedPhone: parsed.phones[0] ?? null,
    sheetNo: parsed.sheetNo,
    suggestedClientId: match.clientId,
  };
}

export type IntakeResult =
  | { ok: true; id: string; duplicate?: boolean }
  | { ok: false; error: string };

/**
 * Guruhga tashlangan chek (rasm yoki PDF) ni yuklab olib saqlaydi.
 * `tgMessageId` bo'yicha idempotent — bir xabar ikki marta yozilmaydi.
 */
export async function intakeReceiptFile(input: {
  chatId: string | number;
  messageId: string | number;
  senderId: string | number;
  senderName: string | null;
  fileId: string;
  mime: string;
  /** Xabar bilan birga kelgan caption (bo'lsa — darhol juftlanadi). */
  caption?: string | null;
}): Promise<IntakeResult> {
  const tgChatId = String(input.chatId);
  const tgMessageId = String(input.messageId);

  const existing = await db.pendingPayment.findUnique({
    where: { tgChatId_tgMessageId: { tgChatId, tgMessageId } },
    select: { id: true },
  });
  if (existing) return { ok: true, id: existing.id, duplicate: true };

  if (!isAllowedMime(input.mime)) {
    return { ok: false, error: `Qo'llab-quvvatlanmaydigan fayl turi: ${input.mime}` };
  }

  const dl = await downloadTelegramFile(input.fileId);
  if (!dl.ok) return { ok: false, error: dl.error };

  const now = Date.now();
  sweep(now);
  const k = key(input.chatId, input.senderId);

  // Matn: caption'da bo'lishi yoki oldinroq alohida xabar bo'lib kelgan bo'lishi mumkin
  let text = input.caption?.trim() || null;
  if (!text) {
    const pendingText = waitingText.get(k);
    if (pendingText && now - pendingText.at <= PAIR_WINDOW_MS) {
      text = pendingText.text;
      waitingText.delete(k);
    }
  }

  const parsedFields = text
    ? await fieldsFromText(text)
    : { rawText: null, parsedName: null, parsedPhone: null, sheetNo: null, suggestedClientId: null };

  const row = await db.pendingPayment.create({
    data: {
      tgChatId,
      tgMessageId,
      senderName: input.senderName,
      receiptMime: input.mime,
      ...parsedFields,
    },
  });

  // Chek fayli PendingPayment id bo'yicha saqlanadi (Payment bilan bir katalog)
  const saved = await saveReceipt(dl.buffer, input.mime, `pending-${row.id}`);
  if (!saved.ok) {
    await db.pendingPayment.delete({ where: { id: row.id } });
    return { ok: false, error: saved.error };
  }
  await db.pendingPayment.update({
    where: { id: row.id },
    data: { receiptPath: saved.relPath },
  });

  // Matn hali kelmagan bo'lsa — keyingi matn xabarini kutamiz
  if (!text) waitingReceipt.set(k, { id: row.id, at: now });

  return { ok: true, id: row.id };
}

/**
 * Guruhga tashlangan matnli xabar (mijoz ma'lumoti).
 * Yaqinda shu odam chek tashlagan bo'lsa — o'sha yozuvga biriktiriladi,
 * aks holda chek kelishini kutib turadi.
 */
export async function intakeReceiptText(input: {
  chatId: string | number;
  senderId: string | number;
  senderName: string | null;
  text: string;
}): Promise<{ attachedTo: string | null }> {
  const now = Date.now();
  sweep(now);
  const k = key(input.chatId, input.senderId);

  const pending = waitingReceipt.get(k);
  if (pending && now - pending.at <= PAIR_WINDOW_MS) {
    waitingReceipt.delete(k);
    const fields = await fieldsFromText(input.text);
    // Faqat hali matn biriktirilmagan bo'lsa yozamiz (poyga holatidan himoya)
    const updated = await db.pendingPayment.updateMany({
      where: { id: pending.id, status: "PENDING", rawText: null },
      data: fields,
    });
    if (updated.count > 0) return { attachedTo: pending.id };
  }

  waitingText.set(k, { text: input.text, at: now, senderName: input.senderName });
  return { attachedTo: null };
}

/** Testlar uchun: juftlash holatini tozalaydi. */
export function _resetPairingState(): void {
  waitingText.clear();
  waitingReceipt.clear();
}

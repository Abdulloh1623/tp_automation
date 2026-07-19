/**
 * Telegram "To'lov Cheklari" guruhi eksportidan eski cheklarni import qiladi.
 *
 * BIR MARTALIK skript — prod image'ga kirmaydi (tesseract.js devDependency).
 * Natija: `PendingPayment` navbatiga `source: "HISTORY"` yozuvlari. To'lov
 * YARATILMAYDI — operator /tolovlar sahifasida har birini tasdiqlaydi.
 *
 * Ishlatish:
 *   npx tsx scripts/import-telegram-receipts.ts <eksport-papkasi> [--dry-run] [--limit N] [--no-ocr]
 *
 * Eksport: Telegram Desktop → guruh → ⋮ → Export chat history
 *          → Photos + Files, format JSON.
 *
 * Qayta ishga tushirish xavfsiz: (tgChatId, tgMessageId) unique, mavjud
 * yozuvlar o'tkazib yuboriladi.
 */
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createWorker, type Worker } from "tesseract.js";
import { parseReceiptText, matchClient, type ClientCandidate } from "../src/lib/receipt-intake";
import { extractAmount } from "../src/lib/receipt-amount";

const db = new PrismaClient();

// Matn va chek alohida xabar bo'lib keladi — bir yuboruvchidan shu oraliqdagi
// xabarlar juftlanadi. Jonli botdagi 5 daqiqadan kengroq: eksportda xabarlar
// qo'lda tashlangani uchun oraliq kattaroq bo'lishi mumkin.
const PAIR_WINDOW_MS = 15 * 60 * 1000;

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

type TgMessage = {
  id: number;
  type?: string;
  date?: string;
  from?: string;
  from_id?: string;
  text?: unknown;
  text_entities?: { type: string; text: string }[];
  photo?: string;
  file?: string;
  mime_type?: string;
  media_type?: string;
};

type TgExport = { name?: string; id?: number; messages: TgMessage[] };

/**
 * Eksportdagi `text` maydoni satr YOKI (satr | {type,text}) massivi bo'lishi
 * mumkin (formatlangan matnda). `text_entities` ishonchliroq — bo'lsa o'shani.
 */
function plainText(m: TgMessage): string {
  if (Array.isArray(m.text_entities) && m.text_entities.length > 0) {
    return m.text_entities.map((e) => e.text).join("");
  }
  const t = m.text;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t
      .map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? "")))
      .join("");
  }
  return "";
}

/**
 * Xabardagi media fayl nisbiy yo'li (rasm yoki hujjat).
 *
 * Eksportda "Files" belgilanmagan bo'lsa, Telegram yo'l o'rniga izoh yozadi:
 *   "(File not included. Change data exporting settings to download.)"
 * Bunday xabarlarni fayli yo'q deb hisoblaymiz.
 */
function mediaPath(m: TgMessage): string | null {
  const raw = typeof m.photo === "string" ? m.photo : typeof m.file === "string" ? m.file : null;
  if (!raw) return null;
  if (raw.startsWith("(") || /not included/i.test(raw)) return null;
  return raw;
}

/** Media bo'lishi kerak edi, lekin eksportga qo'shilmagan. */
function isMediaNotExported(m: TgMessage): boolean {
  const raw = typeof m.photo === "string" ? m.photo : typeof m.file === "string" ? m.file : null;
  return !!raw && (raw.startsWith("(") || /not included/i.test(raw));
}

function mimeFor(m: TgMessage, rel: string): string {
  if (m.photo) return "image/jpeg"; // eksportda rasmlar doim jpg
  const byHeader = m.mime_type;
  if (byHeader && Object.values(MIME_BY_EXT).includes(byHeader)) return byHeader;
  return MIME_BY_EXT[path.extname(rel).toLowerCase()] ?? "";
}

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

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const noOcr = args.includes("--no-ocr");
  const limitArg = args.find((a) => a.startsWith("--limit"));
  const limit = limitArg ? Number(limitArg.split("=")[1] ?? args[args.indexOf(limitArg) + 1]) : Infinity;

  if (!dir) {
    console.error("Eksport papkasini ko'rsating:\n  npx tsx scripts/import-telegram-receipts.ts <papka> [--dry-run] [--limit N] [--no-ocr]");
    process.exit(1);
  }

  const jsonPath = path.join(dir, "result.json");
  const raw = await fs.readFile(jsonPath, "utf8").catch(() => null);
  if (!raw) {
    console.error(`result.json topilmadi: ${jsonPath}`);
    process.exit(1);
  }

  const data = JSON.parse(raw) as TgExport;
  const messages = (data.messages ?? []).filter((m) => m.type !== "service");
  const tgChatId = String(data.id ?? "export");
  console.log(`Guruh: ${data.name ?? "?"} · ${messages.length} ta xabar\n`);

  // --- 1) Matn va media xabarlarni juftlash -------------------------------
  // Har bir media xabar uchun O'SHA yuboruvchidan kelgan, vaqt oynasidagi eng
  // yaqin matnli xabarni topamiz. Bir matn bir chekka biriktiriladi.
  const usedText = new Set<number>();
  const pairs: { media: TgMessage; text: TgMessage | null }[] = [];

  const textMsgs = messages.filter((m) => !mediaPath(m) && plainText(m).trim());
  for (const media of messages.filter((m) => mediaPath(m))) {
    const mediaAt = new Date(media.date ?? 0).getTime();
    let best: TgMessage | null = null;
    let bestGap = Infinity;

    for (const t of textMsgs) {
      if (usedText.has(t.id)) continue;
      if (t.from_id && media.from_id && t.from_id !== media.from_id) continue;
      const gap = Math.abs(new Date(t.date ?? 0).getTime() - mediaAt);
      if (gap <= PAIR_WINDOW_MS && gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    }
    if (best) usedText.add(best.id);
    pairs.push({ media, text: best });
  }

  const notExported = messages.filter(isMediaNotExported).length;
  if (notExported > 0) {
    console.log(
      `⚠ ${notExported} ta chek eksportga QO'SHILMAGAN (eksport sozlamalarida\n` +
        `  "Files" belgilanmagan). Ular import qilinmaydi — kerak bo'lsa\n` +
        `  eksportni "Photos + Files" bilan qayta oling.\n`,
    );
  }

  const withText = pairs.filter((p) => p.text).length;
  console.log(`Chek (media) xabarlar: ${pairs.length}`);
  console.log(`  matn biriktirildi:   ${withText}`);
  console.log(`  matnsiz qoldi:       ${pairs.length - withText}`);
  console.log(`Juftlanmagan matnlar:  ${textMsgs.length - usedText.size}\n`);

  // --- 2) OCR + import ----------------------------------------------------
  const candidates = await loadCandidates();
  const receiptsDir = path.join(process.cwd(), "uploads", "receipts");
  if (!dryRun) await fs.mkdir(receiptsDir, { recursive: true });

  // OCR dry-run'da HAM ishlaydi — shunda bazaga yozishdan oldin qaysi
  // summalar topilishini ko'rib olish mumkin.
  let worker: Worker | null = null;
  if (!noOcr) {
    console.log("Tesseract ishga tushmoqda (birinchi marta til fayllari yuklanadi)...");
    worker = await createWorker(["rus", "eng"]);
  }

  const stats = {
    imported: 0,
    skipped: 0,
    clientFound: 0,
    amountHigh: 0,
    amountLow: 0,
    amountNone: 0,
    fileMissing: 0,
    badMime: 0,
  };

  let n = 0;
  for (const { media, text } of pairs) {
    if (n >= limit) break;
    n++;

    const tgMessageId = String(media.id);
    const existing = await db.pendingPayment.findUnique({
      where: { tgChatId_tgMessageId: { tgChatId, tgMessageId } },
      select: { id: true },
    });
    if (existing) {
      stats.skipped++;
      continue;
    }

    const rel = mediaPath(media)!;
    const abs = path.join(dir, rel);
    const buffer = await fs.readFile(abs).catch(() => null);
    if (!buffer) {
      stats.fileMissing++;
      console.warn(`  ⚠ fayl yo'q: ${rel}`);
      continue;
    }

    const mime = mimeFor(media, rel);
    if (!MIME_BY_EXT[path.extname(rel).toLowerCase()] && !mime) {
      stats.badMime++;
      console.warn(`  ⚠ qo'llab-quvvatlanmaydigan tur: ${rel}`);
      continue;
    }

    // Matn tahlili → mijoz
    const body = text ? plainText(text) : "";
    const parsed = body ? parseReceiptText(body) : null;
    const match = parsed ? matchClient(parsed, candidates) : null;
    if (match?.clientId) stats.clientFound++;

    // OCR → summa (PDF ni tesseract o'qimaydi — o'tkazib yuboramiz)
    let ocrText: string | null = null;
    let amount: ReturnType<typeof extractAmount> | null = null;
    if (worker && mime !== "application/pdf") {
      try {
        const { data: ocr } = await worker.recognize(buffer);
        ocrText = ocr.text;
        amount = extractAmount(ocrText);
      } catch (e) {
        console.warn(`  ⚠ OCR xatosi (${rel}):`, e instanceof Error ? e.message : e);
      }
    }
    if (amount?.confidence === "high") stats.amountHigh++;
    else if (amount?.confidence === "low") stats.amountLow++;
    else stats.amountNone++;

    const occurredAt = media.date ? new Date(media.date) : null;

    if (dryRun) {
      console.log(
        `  [dry] #${media.id} ${occurredAt?.toISOString().slice(0, 10) ?? "?"} ` +
          `mijoz=${match?.clientId ?? "—"} summa=${amount?.amount ?? "—"} (${amount?.confidence ?? "ocr-yo'q"})`,
      );
      stats.imported++;
      continue;
    }

    const row = await db.pendingPayment.create({
      data: {
        tgChatId,
        tgMessageId,
        source: "HISTORY",
        occurredAt,
        senderName: media.from ?? null,
        rawText: body || null,
        parsedName: parsed?.name ?? null,
        parsedPhone: parsed?.phones[0] ?? null,
        sheetNo: parsed?.sheetNo ?? null,
        suggestedClientId: match?.clientId ?? null,
        receiptMime: mime,
        ocrText,
        suggestedAmount: amount?.amount ?? null,
        suggestedCurrency: amount?.currency ?? null,
        amountConfidence: amount?.confidence ?? null,
        amountCandidates: amount?.candidates.length
          ? JSON.stringify(amount.candidates)
          : null,
      },
    });

    const ext = path.extname(rel).toLowerCase() || ".jpg";
    const fileName = `pending-${row.id}${ext}`;
    await fs.writeFile(path.join(receiptsDir, fileName), buffer);
    await db.pendingPayment.update({
      where: { id: row.id },
      data: { receiptPath: `receipts/${fileName}` },
    });

    stats.imported++;
    if (stats.imported % 25 === 0) console.log(`  ... ${stats.imported} ta import qilindi`);
  }

  if (worker) await worker.terminate();

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Natija:`);
  console.log(`  import qilindi:      ${stats.imported}`);
  console.log(`  allaqachon bor:      ${stats.skipped}`);
  console.log(`  mijoz topildi:       ${stats.clientFound}`);
  console.log(`  summa (ishonchli):   ${stats.amountHigh}`);
  console.log(`  summa (taxminiy):    ${stats.amountLow}`);
  console.log(`  summa topilmadi:     ${stats.amountNone}`);
  if (stats.fileMissing) console.log(`  fayl yo'q:           ${stats.fileMissing}`);
  if (stats.badMime) console.log(`  noto'g'ri fayl turi: ${stats.badMime}`);
  console.log(`\n→ /tolovlar sahifasida "Telegramdan kelgan cheklar" bo'limida tasdiqlang.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

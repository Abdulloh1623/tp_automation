// To'lov cheki rasmlarini saqlash (lokal fayl tizimi).
import { promises as fs } from "fs";
import path from "path";

const RECEIPTS_DIR = path.join(process.cwd(), "uploads", "receipts");
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  // Ba'zi banklar (masalan Ipak Yuli) chekni PDF qilib beradi — Telegram
  // guruhiga ham shu ko'rinishda tashlanadi.
  "application/pdf": "pdf",
};

export function isAllowedMime(mime: string): boolean {
  return mime in MIME_EXT;
}

/** Chek rasmimi (PDF emas)? Telegram'ga sendPhoto bilan yuborish uchun. */
export function isImageMime(mime: string): boolean {
  return mime !== "application/pdf" && mime in MIME_EXT;
}

export type SaveResult =
  | { ok: true; relPath: string }
  | { ok: false; error: string };

/** Chek buferini uploads/receipts/ ga saqlaydi. relPath DB'ga yoziladi. */
export async function saveReceipt(
  buffer: Buffer,
  mime: string,
  id: string,
): Promise<SaveResult> {
  if (!isAllowedMime(mime)) {
    return { ok: false, error: "Faqat PNG/JPEG/WebP rasm yoki PDF qabul qilinadi" };
  }
  if (buffer.length === 0) return { ok: false, error: "Chek rasmi bo'sh" };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: "Rasm hajmi 5MB dan oshmasin" };
  }
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const ext = MIME_EXT[mime];
  const fileName = `${id}.${ext}`;
  await fs.writeFile(path.join(RECEIPTS_DIR, fileName), buffer);
  return { ok: true, relPath: `receipts/${fileName}` };
}

/** Saqlangan chek faylini o'chiradi (best-effort — hech qachon throw qilmaydi). */
export async function deleteReceipt(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  // Path traversal himoyasi: faqat receipts/ ichidagi nom (readReceipt bilan bir xil)
  const safe = relPath.replace(/^receipts\//, "").replace(/[/\\]/g, "");
  if (!safe) return;
  try {
    await fs.unlink(path.join(RECEIPTS_DIR, safe));
  } catch {
    // Fayl yo'q yoki o'chirilgan — e'tiborsiz
  }
}

/** Saqlangan chekni o'qiydi (himoyalangan route uchun). */
export async function readReceipt(
  relPath: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  // Path traversal himoyasi: faqat receipts/ ichidagi nom
  const safe = relPath.replace(/^receipts\//, "").replace(/[/\\]/g, "");
  const full = path.join(RECEIPTS_DIR, safe);
  try {
    const buffer = await fs.readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "pdf"
            ? "application/pdf"
            : "image/jpeg";
    return { buffer, mime };
  } catch {
    return null;
  }
}

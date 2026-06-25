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
};

export function isAllowedMime(mime: string): boolean {
  return mime in MIME_EXT;
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
    return { ok: false, error: "Faqat PNG/JPEG/WebP rasm qabul qilinadi" };
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
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { buffer, mime };
  } catch {
    return null;
  }
}

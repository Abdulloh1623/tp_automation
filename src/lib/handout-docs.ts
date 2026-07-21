// Ustaga topshirish hujjatlarini (imzolangan Chiqarib yuborish / Qabul qilish
// hujjati) saqlash — lokal fayl tizimi. pdf/jpg/jpeg qabul qilinadi.
import { promises as fs } from "fs";
import path from "path";

const HANDOUTS_DIR = path.join(process.cwd(), "uploads", "handouts");
const MAX_BYTES = 10 * 1024 * 1024; // 10MB (imzolangan skan/PDF)

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

export function isAllowedHandoutMime(mime: string): boolean {
  // `in` prototip xossalarini ham o'tkazadi — hasOwn ishlatamiz.
  return Object.hasOwn(MIME_EXT, mime);
}

export type SaveResult =
  | { ok: true; relPath: string }
  | { ok: false; error: string };

/**
 * `saveHandoutDoc` qaytaradigan relPath shaklimi — `handouts/<nom>.<pdf|jpg>`?
 *
 * XAVFSIZLIK: bu qiymat DB'ga (`signedDocUrl`) yoziladi va keyin havola
 * sifatida ishlatiladi. Tekshirilmasa `javascript:...` yoki tashqi manzil
 * yozib yuborish mumkin — shu bois shaklni qat'iy chegaralaymiz.
 */
export function isHandoutRelPath(value: string): boolean {
  return /^handouts\/[A-Za-z0-9._-]+\.(pdf|jpg)$/.test(value) && !value.includes("..");
}

/** Hujjat buferini uploads/handouts/ ga saqlaydi. relPath DB'ga yoziladi. */
export async function saveHandoutDoc(
  buffer: Buffer,
  mime: string,
  id: string,
): Promise<SaveResult> {
  if (!isAllowedHandoutMime(mime)) {
    return { ok: false, error: "Faqat PDF yoki JPG hujjat qabul qilinadi" };
  }
  if (buffer.length === 0) return { ok: false, error: "Hujjat bo'sh" };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: "Hujjat hajmi 10MB dan oshmasin" };
  }
  await fs.mkdir(HANDOUTS_DIR, { recursive: true });
  const ext = MIME_EXT[mime];
  const fileName = `${id}.${ext}`;
  await fs.writeFile(path.join(HANDOUTS_DIR, fileName), buffer);
  return { ok: true, relPath: `handouts/${fileName}` };
}

/** Saqlangan hujjatni o'qiydi (himoyalangan route uchun). */
export async function readHandoutDoc(
  relPath: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  // Path traversal himoyasi: faqat handouts/ ichidagi nom
  const safe = relPath.replace(/^handouts\//, "").replace(/[/\\]/g, "");
  const full = path.join(HANDOUTS_DIR, safe);
  try {
    const buffer = await fs.readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime = ext === "pdf" ? "application/pdf" : "image/jpeg";
    return { buffer, mime };
  } catch {
    return null;
  }
}

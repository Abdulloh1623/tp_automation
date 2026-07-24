// FAQ skrinshotlarini (rasm) saqlash — lokal fayl tizimi. png/jpeg/webp qabul
// qilinadi. soliq-docs.ts naqshini takrorlaydi. Prodda `uploads/` volume
// bo'lishi SHART (aks holda rasmlar deploy'da yo'qoladi).
import { promises as fs } from "fs";
import path from "path";

const FAQ_DIR = path.join(process.cwd(), "uploads", "faq");
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export function isAllowedFaqImageMime(mime: string): boolean {
  return Object.hasOwn(MIME_EXT, mime);
}

export type SaveResult =
  | { ok: true; relPath: string }
  | { ok: false; error: string };

/** Rasm buferini uploads/faq/ ga saqlaydi. relPath markdown ichiga yoziladi. */
export async function saveFaqImage(
  buffer: Buffer,
  mime: string,
  id: string,
): Promise<SaveResult> {
  if (!isAllowedFaqImageMime(mime)) {
    return { ok: false, error: "Faqat PNG, JPEG yoki WebP rasm qabul qilinadi" };
  }
  if (buffer.length === 0) return { ok: false, error: "Rasm bo'sh" };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: "Rasm hajmi 5MB dan oshmasin" };
  }
  await fs.mkdir(FAQ_DIR, { recursive: true });
  const ext = MIME_EXT[mime];
  const fileName = `${id}.${ext}`;
  await fs.writeFile(path.join(FAQ_DIR, fileName), buffer);
  return { ok: true, relPath: `faq/${fileName}` };
}

/** Saqlangan rasmni o'qiydi (himoyalangan route uchun). */
export async function readFaqImage(
  fileName: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  // Path traversal himoyasi: faqat toza fayl nomi
  const safe = fileName.replace(/^faq\//, "").replace(/[/\\]/g, "");
  const full = path.join(FAQ_DIR, safe);
  try {
    const buffer = await fs.readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime = EXT_MIME[ext] ?? "application/octet-stream";
    return { buffer, mime };
  } catch {
    return null;
  }
}

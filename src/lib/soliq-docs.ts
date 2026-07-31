// Soliqqa ulash hujjatlarini (guvohnoma skani, kadastr/ijara shartnomasi)
// saqlash — lokal fayl tizimi. pdf / jpeg / word (doc, docx) qabul qilinadi.
import { promises as fs } from "fs";
import path from "path";
import { SOLIQ_DOC_MAX_MB } from "@/lib/constants";

const SOLIQ_DIR = path.join(process.cwd(), "uploads", "soliq");
const MAX_BYTES = SOLIQ_DOC_MAX_MB * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function isAllowedSoliqMime(mime: string): boolean {
  // `in` prototip xossalarini ham o'tkazadi — hasOwn ishlatamiz.
  return Object.hasOwn(MIME_EXT, mime);
}

export type SaveResult =
  | { ok: true; relPath: string }
  | { ok: false; error: string };

/** Hujjat buferini uploads/soliq/ ga saqlaydi. relPath DB'ga yoziladi. */
export async function saveSoliqDoc(
  buffer: Buffer,
  mime: string,
  id: string,
): Promise<SaveResult> {
  if (!isAllowedSoliqMime(mime)) {
    return { ok: false, error: "Faqat PDF, JPEG yoki Word hujjat qabul qilinadi" };
  }
  if (buffer.length === 0) return { ok: false, error: "Hujjat bo'sh" };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: `Hujjat hajmi ${SOLIQ_DOC_MAX_MB}MB dan oshmasin` };
  }
  await fs.mkdir(SOLIQ_DIR, { recursive: true });
  const ext = MIME_EXT[mime];
  const fileName = `${id}.${ext}`;
  await fs.writeFile(path.join(SOLIQ_DIR, fileName), buffer);
  return { ok: true, relPath: `soliq/${fileName}` };
}

/** Saqlangan hujjatni o'qiydi (himoyalangan route uchun). */
export async function readSoliqDoc(
  relPath: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  // Path traversal himoyasi: faqat soliq/ ichidagi nom
  const safe = relPath.replace(/^soliq\//, "").replace(/[/\\]/g, "");
  const full = path.join(SOLIQ_DIR, safe);
  try {
    const buffer = await fs.readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime = EXT_MIME[ext] ?? "application/octet-stream";
    return { buffer, mime };
  } catch {
    return null;
  }
}

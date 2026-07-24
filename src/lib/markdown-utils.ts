// FAQ markdown uchun sof yordamchilar (JSX'siz — vitest to'g'ridan-to'g'ri
// test qiladi). Render lib/markdown.tsx da.

/** Havola URL'ini tekshiradi: ichki `/…` yoki http/https. Aks holda null. */
export function safeLinkUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return u; // ichki yo'l
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return u;
  } catch {
    return null;
  }
  return null;
}

/** Rasm src'i: faqat ichki yo'l (`/api/faq-image/…`) yoki data: — CSP mos. */
export function safeImageUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u)) return u;
  return null;
}

/** Markdown belgilarini olib tashlab, oddiy matn qaytaradi (qidiruv/qisqartma). */
export function stripMarkdown(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // rasm
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // havola → matn
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

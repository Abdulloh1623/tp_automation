// Telegram "To'lov cheklari" guruhidan kelgan chek xabarlarini tahlil qilish.
//
// Guruhdagi xabar formati bir xil emas — real namunalar:
//
//   Bilol                                            <- yuboruvchi (ba'zan bor)
//   Nortojiyev Faxriddin (Sergeli Food city, Mobina kafe)
//   90 965 65 89
//   187 raqam
//
//   Oktam Jo'rayev (Sanjarbek), Namangan viloyati chortoq tumani
//   Tel:90 796 66 76
//   100-raqam
//
// Shuning uchun qator TARTIBIGA tayanmaymiz — har bir qatorni turiga qarab
// ajratamiz. Oxirgi "N raqam" — eski Google Sheets tartib raqami; yangi tizimga
// kerak emas, faqat izoh sifatida saqlanadi.
//
// Summa xabar matnida YO'Q (faqat chek rasmi ichida) — uni operator qo'lda
// kiritadi. Shu sabab bu modul summani umuman qaytarmaydi.

/** Telefonning solishtirish uchun kaliti: oxirgi 9 raqam ("998" prefiksisiz). */
export function phoneKey(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return "";
  return d.slice(-9);
}

/** Qatordagi raqamlar ketma-ketligi telefonga o'xshaydimi (9 yoki 998+9). */
function lineToPhone(line: string): string | null {
  // "Tel:", "Tel." kabi prefikslarni olib tashlaymiz
  const body = line.replace(/^\s*(tel|telefon|tel\.|раб)\s*[:.\-]?\s*/i, "");
  const digits = body.replace(/\D/g, "");
  if (digits.length === 9) return digits;
  if (digits.length === 12 && digits.startsWith("998")) return digits.slice(-9);
  return null;
}

/** "187 raqam" / "100-raqam" / "100 raqam." — eski sheets tartib raqami. */
function lineToSheetNo(line: string): string | null {
  const m = line.match(/^\s*(\d{1,6})\s*[-–\s]?\s*raqam\s*\.?\s*$/i);
  return m ? m[1] : null;
}

export type ParsedReceiptText = {
  /** Mijoz nomi/manzili — eng ma'lumotli qator (topilmasa null). */
  name: string | null;
  /** Topilgan barcha telefonlar (oxirgi 9 raqam ko'rinishida). */
  phones: string[];
  /** Eski Google Sheets tartib raqami (mijoz topishda ISHLATILMAYDI). */
  sheetNo: string | null;
};

/** Chek xabari matnini tarkibiy qismlarga ajratadi. */
export function parseReceiptText(text: string): ParsedReceiptText {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const phones: string[] = [];
  let sheetNo: string | null = null;
  const rest: string[] = [];

  for (const line of lines) {
    const phone = lineToPhone(line);
    if (phone) {
      if (!phones.includes(phone)) phones.push(phone);
      continue;
    }
    const no = lineToSheetNo(line);
    if (no) {
      sheetNo ??= no;
      continue;
    }
    rest.push(line);
  }

  // Mijoz nomi — qolgan qatorlardan HARF soni bo'yicha eng boyi.
  // Namunadagi "Bilol" (yuboruvchi) qisqa, mijoz qatori esa uzun bo'ladi.
  let name: string | null = null;
  let best = 0;
  for (const line of rest) {
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters > best) {
      best = letters;
      name = line;
    }
  }

  return { name, phones, sheetNo };
}

export type ClientCandidate = {
  id: string;
  phone: string;
  extraPhones: string[];
};

export type MatchResult = {
  clientId: string | null;
  /** exact — telefon aniq mos keldi; none — topilmadi. */
  confidence: "exact" | "none";
  /** Bir nechta mijoz mos kelsa true — operator o'zi tanlashi kerak. */
  ambiguous: boolean;
};

/**
 * Mijozni FAQAT telefon raqami bo'yicha topadi.
 *
 * Ismga qarab taxmin qilmaymiz: guruhda ism ko'pincha filial/joy nomi bilan
 * aralash yoziladi ("Nortojiyev Faxriddin (Sergeli Food city, Mobina kafe)"),
 * fuzzy moslash esa noto'g'ri mijozga pul yozib yuborish xavfini tug'diradi.
 * Topilmasa — operator o'zi tanlaydi.
 */
export function matchClientByPhone(
  parsed: ParsedReceiptText,
  candidates: ClientCandidate[],
): MatchResult {
  if (parsed.phones.length === 0) {
    return { clientId: null, confidence: "none", ambiguous: false };
  }

  const byPhone = new Map<string, Set<string>>();
  for (const c of candidates) {
    for (const raw of [c.phone, ...c.extraPhones]) {
      const k = phoneKey(raw);
      if (!k) continue;
      if (!byPhone.has(k)) byPhone.set(k, new Set());
      byPhone.get(k)!.add(c.id);
    }
  }

  const hits = new Set<string>();
  for (const p of parsed.phones) {
    for (const id of byPhone.get(p) ?? []) hits.add(id);
  }

  if (hits.size === 0) return { clientId: null, confidence: "none", ambiguous: false };
  if (hits.size > 1) {
    // Bir raqam bir necha mijozga biriktirilgan — avtomatik tanlamaymiz
    return { clientId: null, confidence: "none", ambiguous: true };
  }
  return { clientId: [...hits][0], confidence: "exact", ambiguous: false };
}

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

/**
 * Qatordagi BARCHA telefonlarni topadi.
 *
 * Bitta qatorda bir nechta raqam bo'lishi mumkin — haqiqiy namuna:
 *   "90 153 22 43, 95 133 44 49"
 * Shuning uchun butun qatorning raqamlarini sanamaymiz (u holda 18 ta raqam
 * chiqib, hech biri topilmasdi), balki telefon shakliga mos bo'laklarni
 * qidiramiz: ixtiyoriy +998 prefiksi + operator kodi + 7 raqam.
 */
function lineToPhones(line: string): string[] {
  // "Tel:", "Telefon —" kabi prefikslar xalaqit bermasin
  const body = line.replace(/(tel|telefon|раб)\s*[:.\-—]?\s*/gi, " ");
  const out: string[] = [];
  // (998)? + 9 raqam, orasida bo'shliq/tire/qavs bo'lishi mumkin
  const re = /(?:\+?998[\s\-()]*)?(\d[\s\-()]*){9}/g;
  for (const m of body.matchAll(re)) {
    const digits = m[0].replace(/\D/g, "");
    const key = digits.length >= 9 ? digits.slice(-9) : "";
    // O'zbekiston mobil kodlari 2 xonali va 2..9 bilan boshlanadi —
    // "000000000" kabi axlatni chetlab o'tamiz
    if (key && /^[2-9]/.test(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Shartnoma raqami: "AB130326158", "AB 080626".
 * Kamida 4 ta raqam talab qilinadi — bazada "AB" kabi buzuq qiymatlar bor
 * (5 ta mijozda bir xil), ular bo'yicha moslash mumkin emas.
 */
function lineToContract(line: string): string | null {
  const m = line.match(/\b([A-Z]{2})\s*[-]?\s*(\d{4,12})\b/i);
  return m ? `${m[1].toUpperCase()}${m[2]}` : null;
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
  /** Shartnoma raqamlari ("AB130326158") — moslashda eng kuchli kalit. */
  contracts: string[];
  /** Barcha qatorlar — restoran nomi bo'yicha moslash uchun. */
  lines: string[];
};

/** Chek xabari matnini tarkibiy qismlarga ajratadi. */
export function parseReceiptText(text: string): ParsedReceiptText {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const phones: string[] = [];
  const contracts: string[] = [];
  let sheetNo: string | null = null;
  const rest: string[] = [];

  for (const line of lines) {
    const found = lineToPhones(line);
    if (found.length > 0) {
      for (const p of found) if (!phones.includes(p)) phones.push(p);
      continue;
    }
    const no = lineToSheetNo(line);
    if (no) {
      sheetNo ??= no;
      continue;
    }
    const contract = lineToContract(line);
    if (contract) {
      if (!contracts.includes(contract)) contracts.push(contract);
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

  return { name, phones, sheetNo, contracts, lines };
}

export type ClientCandidate = {
  id: string;
  phone: string;
  extraPhones: string[];
  restaurantName?: string | null;
  contractNumber?: string | null;
};

/** Qaysi kalit bo'yicha topildi — UI'da operatorga ko'rsatiladi. */
export type MatchKey = "contract" | "phone" | "name";

export type MatchResult = {
  clientId: string | null;
  matchedBy: MatchKey | null;
  /**
   * Kalit bir nechta mijozga mos kelgan (masalan bir xil restoran nomi).
   * Bunday holatda avtomatik tanlamaymiz — operator o'zi tanlaydi.
   */
  ambiguous: boolean;
};

/** Bir kalit → bir nechta mijoz bo'lishi mumkin, shuning uchun Set. */
type Index = Map<string, Set<string>>;

function addTo(index: Index, key: string, id: string): void {
  if (!key) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key)!.add(id);
}

function normalizeName(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeContract(v: string | null | undefined): string {
  const s = (v ?? "").replace(/[\s-]/g, "").toUpperCase();
  // Kamida 4 ta raqam bo'lmasa moslash uchun yaroqsiz. Bazada "AB" kabi
  // buzuq qiymatlar bor (bir nechta mijozda bir xil) — ular chetlab o'tiladi.
  return /^[A-Z]{1,3}\d{4,}$/.test(s) ? s : "";
}

/**
 * Mijozni chek matnidan topadi. Kalitlar ISHONCHLILIK tartibida sinaladi:
 *
 *   1. shartnoma raqami — eng kuchli (haqiqiy eksportda 100% aniq ishladi)
 *   2. telefon raqami   — kuchli
 *   3. restoran nomi    — eng zaif, faqat TO'LIQ mos kelganda
 *
 * Har bir kalitda noaniqlik himoyasi bor: kalit bir nechta mijozga mos kelsa
 * o'sha kalit tashlab yuboriladi va keyingisi sinaladi. Bu muhim, chunki
 * bazada 98 ta mijozning restoran nomi BO'SH va bir nechta shartnoma raqami
 * takrorlanadi — ularsiz noto'g'ri mijozga pul yozilishi mumkin edi.
 *
 * Qisman (fuzzy) moslash ATAYLAB yo'q: "Sulton kafe" va "Sulton kafe 2" —
 * boshqa mijozlar, taxmin qilish pul yozuvida qabul qilib bo'lmaydigan xavf.
 */
export function matchClient(
  parsed: ParsedReceiptText,
  candidates: ClientCandidate[],
): MatchResult {
  const byContract: Index = new Map();
  const byPhone: Index = new Map();
  const byName: Index = new Map();

  for (const c of candidates) {
    addTo(byContract, normalizeContract(c.contractNumber), c.id);
    for (const raw of [c.phone, ...c.extraPhones]) addTo(byPhone, phoneKey(raw), c.id);
    addTo(byName, normalizeName(c.restaurantName), c.id);
  }

  const attempts: { key: MatchKey; index: Index; values: string[] }[] = [
    {
      key: "contract",
      index: byContract,
      values: parsed.contracts.map(normalizeContract).filter(Boolean),
    },
    { key: "phone", index: byPhone, values: parsed.phones },
    {
      key: "name",
      index: byName,
      // Har bir qatorni to'liq nom sifatida sinaymiz (restoran nomi odatda
      // alohida qatorda: "Anor Baliq", "ZGZ-FOOD", "Makon717")
      values: parsed.lines.map(normalizeName).filter(Boolean),
    },
  ];

  let sawAmbiguity = false;

  for (const { key, index, values } of attempts) {
    const hits = new Set<string>();
    for (const v of values) {
      for (const id of index.get(v) ?? []) hits.add(id);
    }
    if (hits.size === 1) {
      return { clientId: [...hits][0], matchedBy: key, ambiguous: false };
    }
    if (hits.size > 1) sawAmbiguity = true;
    // Noaniq yoki topilmadi — keyingi (zaifroq) kalitni sinaymiz
  }

  return { clientId: null, matchedBy: null, ambiguous: sawAmbiguity };
}

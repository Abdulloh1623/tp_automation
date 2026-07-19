// Chek matnidan (OCR natijasi) to'lov summasini ajratish.
//
// Bu modul SOF — Tesseract'ga bog'liq emas, shuning uchun test qilinadi.
// OCR'ning o'zi `scripts/ocr-receipts.ts` da (devDependency), bu yerda faqat
// matndan raqam topish mantiqi.
//
// NEGA BIR NECHTA NOMZOD: qog'oz Paynet chekida bir vaqtda
//   To'lov summasi:               339 806
//   Summa (mijozdan olinadigan):  350 000
// bo'ladi — ya'ni mijoz to'lagan va hisobga tushgan summa HAR XIL (komissiya).
// Qaysi biri "to'lov" ekani chekka qarab farq qiladi, shuning uchun avtomatik
// bittasini tanlab qo'ymaymiz: barcha nomzodlarni yorlig'i bilan qaytaramiz,
// operator UI'da ko'rib tanlaydi.

/** Summa nomzodi — matndagi bitta topilma. */
export type AmountCandidate = {
  /** Raqam qiymati (masalan 349000). */
  value: number;
  /** Qaysi yorliq yonida topildi ("To'lov summasi") yoki null (yorliqsiz). */
  label: string | null;
  /** Valyuta belgisi topilgan bo'lsa. */
  currency: "UZS" | "USD" | null;
  /** Yorliqli topilma yorliqsizdan ustun. */
  score: number;
};

export type AmountExtraction = {
  /** Eng ehtimolli summa (nomzod bo'lmasa null). */
  amount: number | null;
  currency: "UZS" | "USD" | null;
  /** high — ishonchli yorliq bilan topildi; low — taxmin; none — topilmadi. */
  confidence: "high" | "low" | "none";
  /** Operator tanlashi uchun barcha nomzodlar (baholi tartibda). */
  candidates: AmountCandidate[];
};

// Summani bildiradigan yorliqlar. Tartib MUHIM emas, lekin `weight` muhim.
// "To'lov summasi" — hisobga tushgan summa, odatda biz yozadiganimiz.
const LABELS: { re: RegExp; label: string; weight: number }[] = [
  { re: /to[''`]?lov\s*summasi/i, label: "To'lov summasi", weight: 100 },
  { re: /summa\s*\(?\s*mijozdan/i, label: "Mijozdan olinadigan", weight: 90 },
  { re: /сумма\s*платежа/i, label: "Сумма платежа", weight: 100 },
  { re: /jami|итого|umumiy\s*summa/i, label: "Jami", weight: 80 },
  { re: /^\s*summa\s*[:\-]/i, label: "Summa", weight: 70 },
  { re: /^\s*сумма\s*[:\-]/i, label: "Сумма", weight: 70 },
];

// Aniq YO'Q — bular summa emas, lekin raqamli qatorlar (chalkashtirmaslik uchun)
const NOT_AMOUNT = [
  /komissiya|комисси/i,
  /qqs|ндс|nds/i,
  /karta\s*raqami|карта|card/i,
  /terminal|chek\s*raqami|stir|inn|agent/i,
  /tranzaksiya|транзакц|операци/i,
  /yuboruvchi|qabul\s*qiluvchi|отправител|получател/i,
  /telefon|tel\b/i,
  /miqdor|количество/i,
  /\*{3,}/, // niqoblangan karta raqami: "**** **** **** 4881"
  /^\s*\d{1,2}[.:]\d{2}/, // vaqt
  /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/, // sana: 18.07.2026
];

/**
 * Qatordan pul miqdorini ajratadi.
 * "349 000 so'm" → 349000 · "1 234 567,89" → 1234567.89 · "350 000" → 350000
 */
function parseMoney(raw: string): number | null {
  // Bo'shliq/apostrof bilan ajratilgan minglar: "349 000", "1'234'567"
  const m = raw.match(/\d[\d\s'’.,]*\d|\d/);
  if (!m) return null;

  let s = m[0].replace(/[\s'’]/g, "");

  // Kasr ajratkichi: oxirgi "," yoki "." dan keyin 1-2 raqam bo'lsa — kasr.
  const frac = s.match(/[.,](\d{1,2})$/);
  if (frac) {
    s = s.slice(0, -frac[0].length).replace(/[.,]/g, "") + "." + frac[1];
  } else {
    s = s.replace(/[.,]/g, "");
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Qatordagi valyuta belgisi. */
function currencyOf(line: string): "UZS" | "USD" | null {
  if (/so[''`]?m|сум|uzs/i.test(line)) return "UZS";
  if (/\$|usd|доллар/i.test(line)) return "USD";
  return null;
}

/**
 * Chek matnidan summa nomzodlarini topadi.
 *
 * Summalar realistik oraliqda bo'lishi kerak — chek raqami (35858040717) yoki
 * karta raqami summa deb qabul qilinmasligi uchun.
 */
export function extractAmount(
  text: string,
  opts: { min?: number; max?: number } = {},
): AmountExtraction {
  const min = opts.min ?? 1000; // 1000 so'mdan kam to'lov bo'lmaydi
  const max = opts.max ?? 500_000_000; // 500 mln dan ortiq ham

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates: AmountCandidate[] = [];

  for (const line of lines) {
    if (NOT_AMOUNT.some((re) => re.test(line))) continue;

    const value = parseMoney(line);
    if (value === null || value < min || value > max) continue;

    const hit = LABELS.find((l) => l.re.test(line));
    candidates.push({
      value,
      label: hit?.label ?? null,
      currency: currencyOf(line),
      // Yorliqsiz topilma past ball; katta summa biroz ustun (chek raqamlari
      // odatda filtrlanadi, lekin qolgani ichida to'lov eng katta bo'ladi)
      score: (hit?.weight ?? 10) + Math.min(Math.log10(value), 9),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Bir xil qiymat bir necha marta chiqsa — bittasini qoldiramiz
  const seen = new Set<number>();
  const unique = candidates.filter((c) => {
    if (seen.has(c.value)) return false;
    seen.add(c.value);
    return true;
  });

  const best = unique[0] ?? null;
  return {
    amount: best?.value ?? null,
    currency: best?.currency ?? (unique.find((c) => c.currency)?.currency ?? null),
    confidence: !best ? "none" : best.label ? "high" : "low",
    candidates: unique.slice(0, 6),
  };
}

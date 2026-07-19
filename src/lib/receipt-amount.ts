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
  // Kompaniyaga TUSHGAN summa (komissiyasiz) — biz yozadiganimiz shu.
  // Bank ilovalarida katta sarlavha komissiya bilan birga ko'rsatiladi
  // (694 830 = 690 000 + 4 830), obuna narxi esa sof tushum bo'ladi.
  {
    re: /qabul\s*qiluvchi\w*\s*o[''`]?tkaziladigan|сумма\s*зачислени|к\s*зачислению|получатель\s*получит/i,
    label: "Komissiyasiz",
    weight: 120,
  },
  { re: /to[''`]?lov\s*summasi/i, label: "To'lov summasi", weight: 100 },
  { re: /summa\s*\(?\s*mijozdan/i, label: "Mijozdan olinadigan", weight: 90 },
  { re: /сумма\s*платежа/i, label: "Сумма платежа", weight: 100 },
  { re: /jami|итого|umumiy\s*summa/i, label: "Jami", weight: 80 },
  { re: /^\s*summa\s*[:\-]/i, label: "Summa", weight: 70 },
  { re: /^\s*сумма\s*[:\-]/i, label: "Сумма", weight: 70 },
];

/**
 * Summa yorlig'i OLDINGI qatorda turadigan holatlar (bank ilovalari):
 *   Перевод на карту
 *   707 000 сум          ← summa keyingi qatorda
 * Bunday yorliqning o'zida raqam bo'lmaydi.
 */
const LABELS_ABOVE: { re: RegExp; label: string; weight: number }[] = [
  { re: /перевод\s*(на\s*карту|отправлен|выполнен)/i, label: "Перевод", weight: 85 },
  { re: /^\s*(pul\s*)?o[''`]?tkazma/i, label: "O'tkazma", weight: 85 },
  { re: /успешно|muvaffaqiyatli|bajarildi/i, label: "Bajarildi", weight: 60 },
];

/** Raqamdan keyin valyuta belgisi ("707 000 сум") — kuchli signal. */
const CURRENCY_WEIGHT = 55;

// Aniq YO'Q — bular summa emas, lekin raqamli qatorlar (chalkashtirmaslik uchun)
/**
 * Komissiya qatorlari. Ular to'lov EMAS, lekin qiymati kerak: chekda sof
 * tushum yozilmagan bo'lsa, uni katta summadan komissiyani ayirib olamiz
 * (667 260 − 7 260 = 660 000).
 */
const FEE_LABELS = /komissiya|комисси|стоимость\s*услуг|xizmat\s*narxi/i;

const NOT_AMOUNT = [
  /komissiya|комисси/i,
  /стоимость\s*услуг|xizmat\s*narxi/i, // xizmat haqi — to'lov emas
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
  const fees: number[] = [];

  for (const [i, line] of lines.entries()) {
    // Komissiyani alohida yig'amiz — sof tushumni hisoblash uchun kerak
    if (FEE_LABELS.test(line)) {
      const fee = parseMoney(line);
      if (fee !== null && fee > 0) fees.push(fee);
      continue;
    }
    if (NOT_AMOUNT.some((re) => re.test(line))) continue;

    const value = parseMoney(line);
    if (value === null || value < min || value > max) continue;

    const currency = currencyOf(line);
    const sameLine = LABELS.find((l) => l.re.test(line));
    // Yorliq oldingi qatorda bo'lishi mumkin ("Перевод на карту" → summa).
    // Faqat o'sha qatorda raqam bo'lmaganda hisobga olamiz.
    const prev = i > 0 ? lines[i - 1] : "";
    const aboveLabel =
      !sameLine && prev && parseMoney(prev) === null
        ? LABELS_ABOVE.find((l) => l.re.test(prev))
        : undefined;

    const hit = sameLine ?? aboveLabel;
    const base = hit?.weight ?? (currency ? CURRENCY_WEIGHT : 10);

    candidates.push({
      value,
      label: hit?.label ?? null,
      currency,
      // Katta summa biroz ustun (chek/terminal raqamlari yuqorida
      // filtrlangan, qolgani ichida to'lov odatda eng kattasi)
      score: base + Math.min(Math.log10(value), 9),
    });
  }

  // Chekda sof tushum YOZILMAGAN bo'lsa (Ipak Yo'li kabi: faqat katta summa
  // va "Стоимость услуги"), uni hisoblab qo'shamiz: katta summa − komissiya.
  // Faqat bitta komissiya bo'lganda ishonchli, aks holda qaysi biri kimga
  // tegishli ekani noaniq.
  const alreadyNet = candidates.some((c) => c.label === "Komissiyasiz");

  // Qiyshiq suratlarda OCR chap ustundagi yorliqlarni umuman o'qimaydi —
  // ekranda faqat ikki raqam qoladi: katta summa va komissiya, yorliqsiz.
  // Bunday holatda ham sof tushumni chiqaramiz, lekin ISHONCH PAST bo'ladi
  // (yorliq dalili yo'q), shuning uchun operator albatta tekshiradi.
  let netIsGuess = false;
  if (!alreadyNet && fees.length === 0 && candidates.length === 2) {
    const [big, small] = [...candidates].sort((a, b) => b.value - a.value);
    const net = big.value - small.value;
    // Komissiya odatda summaning 10% idan kam, sof tushum esa dumaloq
    if (small.value < big.value * 0.1 && net >= min && net % 1000 === 0) {
      fees.push(small.value);
      netIsGuess = true;
    }
  }

  if (!alreadyNet && fees.length === 1) {
    const total = candidates.reduce<AmountCandidate | null>(
      (m, c) => (!m || c.value > m.value ? c : m),
      null,
    );
    const net = total ? total.value - fees[0] : 0;
    // Sof tushum odatda dumaloq raqam (690 000, 660 000) — bu naqsh
    // hisoblanganning to'g'riligini tasdiqlaydi
    if (total && net >= min && net % 1000 === 0) {
      candidates.push({
        value: net,
        label: netIsGuess ? "Komissiyasiz (taxminiy)" : "Komissiyasiz (hisoblangan)",
        currency: total.currency,
        score: 115 + Math.min(Math.log10(net), 9),
      });
    }
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

  // "high" ikki holatda: aniq yorliq topilgan ("To'lov summasi"), YOKI
  // raqam yonida valyuta belgisi bor va u eng katta nomzod ("707 000 сум").
  // Ikkinchisi bank ilovasi skrinshotlari uchun — u yerda katta summa
  // yorliqsiz, yakka o'zi turadi.
  const currencyTop =
    !!best?.currency && unique.every((c) => c.value <= best.value);
  const confidence: AmountExtraction["confidence"] = !best
    ? "none"
    : // Yorliqsiz taxmin qilingan sof tushum — har doim tekshirilsin
      netIsGuess
      ? "low"
      : best.label || currencyTop
        ? "high"
        : "low";

  return {
    amount: best?.value ?? null,
    currency: best?.currency ?? (unique.find((c) => c.currency)?.currency ?? null),
    confidence,
    candidates: unique.slice(0, 6),
  };
}

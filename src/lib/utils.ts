import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { currencySymbol, UZBEK_MONTHS, UZBEK_WEEKDAYS } from "./constants";
import { tzParts } from "./tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Uzilmas probel — ming ajratgichi (uz-UZ konvensiyasi). */
const NBSP = " ";

/**
 * Sonni ming ajratgich bilan yozadi: `1946` -> `1 946`, `10495.5` -> `10 495,5`.
 *
 * NEGA `Intl.NumberFormat` EMAS: uning natijasi ish muhitiga bog'liq. Node
 * `uz-UZ` uchun `"1 946"` (uzilmas probel) beradi, Chrome esa `"1,946"` —
 * ya'ni server bilan brauzer boshqa matn chiqaradi va summa ko'rsatadigan HAR
 * BIR klient komponentda hydration mismatch bo'ladi (React butun daraxtni
 * qayta quradi). Ajratgichni o'zimiz qo'yganda ikkala tomon bir xil ishlaydi.
 * Ko'rinish o'zgarmaydi: ming — uzilmas probel, kasr — vergul.
 */
function groupNumber(value: number, decimals: number): string {
  // toFixed — eksponensial yozuvdan (1e21) va suzuvchi nuqta qoldig'idan himoya.
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac = ""] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  // Ortiqcha nollar tashlanadi: 29.50 -> "29,5", 29.00 -> "29".
  const trimmed = frac.replace(/0+$/, "");
  return (value < 0 ? "-" : "") + grouped + (trimmed ? "," + trimmed : "");
}

/** Valyutasiz son: `1234567` -> `1 234 567`. */
export function formatNumber(value: number, decimals = 0): string {
  return groupNumber(value, decimals);
}

export function formatMoney(amount: number, currency: string): string {
  const formatted = groupNumber(amount, currency === "UZS" ? 0 : 2);
  return currency === "USD"
    ? `$${formatted}`
    : `${formatted} ${currencySymbol(currency)}`;
}

/**
 * Sanani `Date` ga keltiradi; yaroqsiz bo'lsa `null`.
 *
 * Ilgari yaroqsiz sana `Intl.format` ichida RangeError bilan yiqilardi.
 */
function toDate(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return isNaN(d.getTime()) ? null : d;
}

/** "DD/MM/YYYY" — UTC+5 (Toshkent) bo'yicha. */
export function formatDate(date: Date | string | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  const p = tzParts(d);
  return `${p.dd}/${p.mm}/${p.yyyy}`;
}

/** "DD/MM/YYYY, HH:MM" — UTC+5 (Toshkent) bo'yicha. */
export function formatDateTime(date: Date | string | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  const p = tzParts(d);
  return `${p.dd}/${p.mm}/${p.yyyy}, ${p.hh}:${p.mi}`;
}

/** "shanba, 01-avgust" — tablo uchun to'liq o'zbekcha sana. */
export function formatDateLong(date: Date | string | null | undefined): string {
  const d = toDate(date);
  if (!d) return "—";
  const p = tzParts(d);
  return `${UZBEK_WEEKDAYS[p.weekday]}, ${p.dd}-${UZBEK_MONTHS[p.month].toLowerCase()}`;
}

/** Bugundan necha kun farq (musbat = kelajak, manfiy = o'tgan). */
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Summa input'idan xom qiymatni ajratadi: "9 000 000" -> "9000000".
 * Faqat raqamlar va bitta nuqta (kasr 2 xonagacha) qoldiriladi.
 */
export function parseAmountInput(display: string | null | undefined): string {
  const s = String(display ?? "").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot === -1) return s;
  return s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
}

/**
 * Kiritilayotgan summani mingliklarga ajratib ko'rsatadi: "9000000" -> "9 000 000".
 * Kasr qismi (USD uchun) saqlanadi. Faqat ko'rsatish uchun — saqlashда probel
 * olib tashlanadi (parseAmountInput). uz-UZ standarti: probel ajratuvchi.
 */
export function formatAmountInput(raw: string | null | undefined): string {
  const s = parseAmountInput(raw);
  if (s === "") return "";
  const dot = s.indexOf(".");
  const intPart = (dot === -1 ? s : s.slice(0, dot)).replace(/^0+(?=\d)/, "");
  const grouped = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dot === -1 ? grouped : grouped + "." + s.slice(dot + 1);
}

/**
 * Telefon input uchun jonli format: "+998 90 481 43 75" ko'rinishiga keltiradi.
 * 998 bilan boshlansa guruhlaydi; aks holda foydalanuvchi kiritganini (+ bilan)
 * saqlaydi — ya'ni +998 ni o'chirish/o'zgartirishga to'sqinlik qilmaydi.
 */
export function formatPhoneInput(raw: string | null | undefined): string {
  if (raw == null) return "";
  const hasPlus = String(raw).trimStart().startsWith("+");
  const d = String(raw).replace(/\D/g, "");
  if (d.startsWith("998")) {
    const rest = d.slice(3, 12); // kompaniya kodi + mobil (9 raqam)
    const parts = [
      rest.slice(0, 2),
      rest.slice(2, 5),
      rest.slice(5, 7),
      rest.slice(7, 9),
    ].filter(Boolean);
    return "+998" + (parts.length ? " " + parts.join(" ") : "");
  }
  return (hasPlus ? "+" : "") + d;
}

/** Telefon raqamini solishtirish uchun normallashtirish (faqat raqamlar). */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

/** Telefonni o'qishga qulay ko'rinishda: +998904814375 -> "+998 90 481 43 75". */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998"))
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  if (d.length === 9)
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  return raw.trim();
}

/** HTML date input uchun yyyy-mm-dd format. */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

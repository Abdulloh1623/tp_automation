// To'lov tsikli (billing) yordamchilari — shartnoma sanasidan keyingi oylik
// to'lov sanasini hisoblaydi. Server action, cron va bir martalik data-fix
// skripti — hammasi shu yagona mantiqni ishlatadi (izchillik uchun).
// Biznex integratsiyasi faqat server tomonida (server action / RSC render /
// cron skript) chaqiriladi; kredensiallar faqat process.env orqali o'qiladi va
// klient bundle'iga tushmaydi (bu modul klient komponentda import qilinmaydi).
import {
  addMonths,
  differenceInCalendarDays,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";

/**
 * `anchor` (shartnoma yoki mijoz yaratilgan) sanasining oylik "kun"iga
 * asoslanib, `from` (odatda bugun) sanasidan boshlab eng yaqin (shu kundagi
 * yoki keyingi) to'lov sanasini qaytaradi.
 *
 * - Oyda o'sha kun bo'lmasa (masalan 31-kun 30 kunlik oyda) — oyning oxirgi
 *   kuniga qisqartiriladi (31 → 30/28).
 * - Natija soati 12:00 (peshin) qilib belgilanadi — bu vaqt mintaqasi
 *   siljishidan (UTC saqlash / lokal ko'rsatish) kelib chiqadigan "bir kun
 *   kam/ortiq" xatosini oldini oladi (seed.ts bilan bir xil yondashuv).
 *
 * Misol: anchor = 14-aprel, from = 2026-07-04 → 2026-07-14.
 *        anchor = 2-may,   from = 2026-07-04 → 2026-08-02 (2-iyul o'tib ketgan).
 */
export function computeNextPaymentDate(anchor: Date, from: Date = new Date()): Date {
  const day = anchor.getDate(); // 1..31
  const today = startOfDay(from);

  const occurrenceIn = (ref: Date): Date => {
    const monthStart = startOfMonth(ref);
    const clampedDay = Math.min(day, getDaysInMonth(monthStart));
    return new Date(monthStart.getFullYear(), monthStart.getMonth(), clampedDay, 12, 0, 0, 0);
  };

  let candidate = occurrenceIn(today);
  if (candidate < today) candidate = occurrenceIn(addMonths(today, 1));
  return candidate;
}

// ---------------------------------------------------------------------------
// Biznex API integratsiyasi — mijozning obuna holatini (aktiv / muddat) olish.
//
// Autentifikatsiya: Biznex Keycloak ishlatadi — dinamik login YO'Q. Statik Bearer
// token `.env` orqali beriladi. Kerakli kalitlar:
//   BIZNEX_API_URL      = https://prod-api.biznex.uz/api/v1/admin
//   BIZNEX_STATIC_TOKEN = <Keycloak access token>
// Sozlanmagan bo'lsa yoki API xato bersa — funksiyalar "unknown" qaytaradi va
// chaqiruvchi sahifa hech qachon buzilmaydi.
// ---------------------------------------------------------------------------

const BIZNEX_TIMEOUT_MS = 8000; // to'liq ro'yxat (size=1000) uchun yetarli, biroq sahifani uzoq ushlamaydi

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Telefonni solishtirish uchun faqat raqamlar (masalan +998 90 ... -> 99890...). */
function digits(s: string): string {
  return s.replace(/\D/g, "");
}

export type BiznexSubscriptionStatus =
  | "active"
  | "expired"
  | "inactive"
  | "not_found" // telefon Biznex'da topilmadi (404 yoki bo'sh javob)
  | "unknown"; // sozlanmagan / API xatosi — flag saqlanmaydi

export type BiznexSubscription = {
  status: BiznexSubscriptionStatus;
  active: boolean;
  expiresAt: string | null;
  remainingDays: number; // <= 0 => muddati tugagan
};

const BIZNEX_UNKNOWN: BiznexSubscription = {
  status: "unknown",
  active: false,
  expiresAt: null,
  remainingDays: 0,
};

const BIZNEX_NOT_FOUND: BiznexSubscription = {
  status: "not_found",
  active: false,
  expiresAt: null,
  remainingDays: 0,
};

/**
 * Biznex javobidan obunalar massivini ajratadi. Shakl har xil bo'lishi mumkin:
 * top-level massiv, Spring pageable `{ content: [...] }`, yoki `{ data: ... }`
 * (massiv yoki `{ content }`), yoxud `{ results }` / `{ items }`.
 */
function extractList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  const root = asRecord(payload);
  const candidates: unknown[] = [
    root.content,
    root.data,
    asRecord(root.data).content,
    root.results,
    root.items,
  ];
  for (const c of candidates) if (Array.isArray(c)) return c.filter(isRecord);
  return [];
}

// Biznex obuna yozuvining kerakli maydonlari (haqiqiy sxema bo'yicha).
type BiznexRecord = {
  phone: string; // faqat raqamlar, masalan "998998148116"
  status: string; // "ACTIVE" | "EXPIRED" | "INACTIVE" | ... (katta harflarda)
  expiresAt: string | null;
  daysRemaining: number | null;
};

/** Xom JSON yozuvini BiznexRecord'ga aylantiradi (telefonsiz yozuvlar tashlanadi). */
function toBiznexRecord(raw: Record<string, unknown>): BiznexRecord | null {
  const phone = typeof raw.phone === "string" ? digits(raw.phone) : "";
  if (!phone) return null;
  return {
    phone,
    status: typeof raw.status === "string" ? raw.status.toUpperCase() : "",
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : null,
    daysRemaining: typeof raw.daysRemaining === "number" ? raw.daysRemaining : null,
  };
}

// Biznex `search` faqat ism/ID bo'yicha filtrlaydi (telefon EMAS). Shu bois to'liq
// obunalar ro'yxatini BIR MARTA olib, telefon bo'yicha lokal qidiramiz. Ro'yxat
// modul darajasida keshlanadi:
//  - nightly skript (qisqa umr): butun ishlash davomida bitta fetch;
//  - uzoq ishlovchi Next server: TTL (10 daqiqa) bo'yicha yangilanadi.
// `inflight` bir vaqtdagi chaqiruvlarni bitta fetch'ga birlashtiradi.
const BIZNEX_LIST_TTL_MS = 10 * 60 * 1000;
let cachedSubscriptions: BiznexRecord[] | null = null;
let cachedAt = 0;
let inflight: Promise<BiznexRecord[] | null> | null = null;

/** To'liq obunalar ro'yxatini oladi (keshlangan). Xatoda null — kesh buzilmaydi. */
async function loadSubscriptions(
  base: string,
  token: string,
): Promise<BiznexRecord[] | null> {
  if (cachedSubscriptions && Date.now() - cachedAt < BIZNEX_LIST_TTL_MS) {
    return cachedSubscriptions;
  }
  if (inflight) return inflight; // boshqa chaqiruv allaqachon yuklayapti

  inflight = (async () => {
    try {
      const res = await fetch(`${base}/subscriptions?page=0&size=1000`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(BIZNEX_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const list = extractList(await res.json())
        .map(toBiznexRecord)
        .filter((r): r is BiznexRecord => r !== null);
      cachedSubscriptions = list;
      cachedAt = Date.now();
      return list;
    } catch {
      return null; // tarmoq/timeout — mavjud kesh (agar bo'lsa) saqlanadi
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Bitta obuna yozuvini UI holatiga (status + qolgan kun) aylantiradi. */
function interpretRecord(rec: BiznexRecord): BiznexSubscription {
  const expiresAt = rec.expiresAt;

  // Faol emas — EXPIRED => expired, aks holda inactive.
  if (rec.status !== "ACTIVE") {
    const status = rec.status === "EXPIRED" ? "expired" : "inactive";
    return { status, active: false, expiresAt, remainingDays: 0 };
  }

  // ACTIVE — qolgan kunni to'g'ridan-to'g'ri `daysRemaining`dan olamiz
  // (bo'lmasa `expiresAt`dan hisoblaymiz).
  let days = rec.daysRemaining;
  if (days === null && expiresAt) {
    const d = new Date(expiresAt);
    days = Number.isNaN(d.getTime())
      ? null
      : differenceInCalendarDays(startOfDay(d), startOfDay(new Date()));
  }
  if (days === null) {
    return { status: "unknown", active: true, expiresAt, remainingDays: 0 };
  }
  if (days <= 0) {
    return { status: "expired", active: false, expiresAt, remainingDays: 0 };
  }
  return { status: "active", active: true, expiresAt, remainingDays: days };
}

/**
 * Mijozning Biznex obunasi holatini TELEFON RAQAMI bo'yicha oladi.
 *
 * To'liq obunalar ro'yxati bir marta olinib keshlanadi (`loadSubscriptions`),
 * so'ng telefon bo'yicha lokal qidiriladi (to'liq raqam yoki oxirgi 9 raqam).
 * - Ro'yxatda topilmasa => `not_found`.
 * - status !== "ACTIVE" => `expired` (EXPIRED) yoki `inactive`.
 * - status === "ACTIVE" => `daysRemaining` bo'yicha countdown (<= 0 => `expired`).
 * - Sozlanmagan / fetch xatosi => `unknown` (flag saqlanadi, sahifa buzilmaydi).
 */
export async function getBiznexSubscription(
  phone: string,
): Promise<BiznexSubscription> {
  const base = process.env.BIZNEX_API_URL;
  const token = process.env.BIZNEX_STATIC_TOKEN;
  if (!base || !token) return BIZNEX_UNKNOWN; // integratsiya sozlanmagan

  const normalized = digits(phone ?? "");
  if (!normalized) return BIZNEX_NOT_FOUND; // raqamsiz mijozni moslab bo'lmaydi

  const list = await loadSubscriptions(base, token);
  if (!list) return BIZNEX_UNKNOWN; // fetch muvaffaqiyatsiz — flag o'zgarmaydi

  const tail9 = normalized.slice(-9);
  const match = list.find(
    (r) => r.phone === normalized || (tail9.length === 9 && r.phone.endsWith(tail9)),
  );
  if (!match) return BIZNEX_NOT_FOUND;

  return interpretRecord(match);
}

/**
 * getBiznexSubscription natijasini `Client.biznexStatus` uchun flag'ga aylantiradi.
 * "unknown" (API o'chiq/sozlanmagan) => null: fon sinxronizatsiyasi bunda mavjud
 * flagni O'CHIRMAYDI (transient xatoda yaxshi ma'lumot yo'qolmasin).
 */
export function biznexStatusFlag(sub: BiznexSubscription): string | null {
  switch (sub.status) {
    case "active":
      return "ACTIVE";
    case "expired":
      return "EXPIRED";
    case "inactive":
      return "INACTIVE";
    case "not_found":
      return "NOT_FOUND";
    default:
      return null; // unknown
  }
}

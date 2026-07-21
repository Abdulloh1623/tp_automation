// Markazlashgan Zod validatsiya sxemalari — ruxsat etilgan qiymatlar
// yagona manba (constants.ts) dan generatsiya qilinadi. Server action
// chegaralarida noto'g'ri/buzuq ma'lumot kirishining oldini oladi.
import { z } from "zod";
import {
  CLIENT_STATUS,
  CURRENCY,
  EQUIPMENT_MODE,
  LEAD_OUTCOME,
  LEAD_STAGE,
  PAYMENT_METHOD,
  TICKET_TYPE,
  TICKET_PRIORITY,
  TICKET_STATUS,
} from "./constants";

/** Obyekt kalitlaridan z.enum uchun tuple yasaydi (manba — constants.ts). */
function keysOf(obj: Record<string, unknown>): [string, ...string[]] {
  return Object.keys(obj) as [string, ...string[]];
}

export const currencyEnum = z.enum(keysOf(CURRENCY)); // USD | UZS
export const paymentMethodEnum = z.enum(keysOf(PAYMENT_METHOD)); // CARD | QR
export const clientStatusEnum = z.enum(keysOf(CLIENT_STATUS)); // ACTIVE | INACTIVE | PENDING
export const equipmentModeEnum = z.enum(keysOf(EQUIPMENT_MODE));
export const leadOutcomeEnum = z.enum(keysOf(LEAD_OUTCOME));
export const leadStageEnum = z.enum(keysOf(LEAD_STAGE));
export const ticketTypeEnum = z.enum(keysOf(TICKET_TYPE));
export const ticketPriorityEnum = z.enum(keysOf(TICKET_PRIORITY));
export const ticketStatusEnum = z.enum(keysOf(TICKET_STATUS));

/** Erkin matn maydonlari uchun cheklangan satr (DB bloat / abuse oldini oladi). */
export const noteString = z
  .string()
  .trim()
  .max(2000, "Izoh juda uzun (2000 belgidan oshmasin)");

/** `noteString` ning chegarasi — to'g'ridan-to'g'ri argument oladigan joylar uchun. */
export const NOTE_MAX_LENGTH = 2000;

/**
 * Erkin matnni xavfsiz uzunlikka keltiradi (trim + kesish).
 *
 * FormData orqali kelmaydigan (argument sifatida uzatiladigan) izohlar Zod'dan
 * o'tmaydi — ular cheklanmasa DB'ni shishirish uchun ishlatilishi mumkin.
 * Rad etish o'rniga KESAMIZ: izoh yordamchi ma'lumot, uni yo'qotgandan ko'ra
 * qisqartirgan yaxshi.
 */
export function safeNote(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  if (!t) return null;
  return t.length > NOTE_MAX_LENGTH ? t.slice(0, NOTE_MAX_LENGTH) : t;
}

/**
 * Foydalanuvchi kiritgan havola. FAQAT http/https ga ruxsat beriladi.
 *
 * XAVFSIZLIK: bu qiymat `<a href={...}>` ichida render qilinadi. Sxemasi
 * tekshirilmasa `javascript:...` yozib yuborish mumkin — havolani bosgan
 * xodimning sessiyasida kod ishlaydi (saqlanadigan XSS). React `javascript:`
 * uchun ogohlantirish yozadi, lekin atributni baribir render qiladi, va
 * CSP'dagi script-src ham `javascript:` navigatsiyasini to'smaydi.
 */
export const externalUrl = z
  .string()
  .trim()
  .min(1, "Havolani kiriting")
  .max(1000, "Havola juda uzun")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Havola http:// yoki https:// bilan boshlanishi kerak");

// Predikatlar — FormData bo'lmagan (to'g'ridan-to'g'ri argument) joylar uchun.
// MUHIM: `key in OBJECT` ishlatmaslik kerak — u prototip xossalarini ham
// (masalan "toString") true qaytaradi; enum.safeParse faqat haqiqiy kalitni qabul qiladi.
/** Zod xatosini { maydon: birinchi_xabar } ko'rinishiga aylantiradi (forma UI uchun). */
export function toFieldErrors(err: z.ZodError): Record<string, string> {
  const flat = err.flatten().fieldErrors;
  const out: Record<string, string> = {};
  for (const [key, msgs] of Object.entries(flat)) {
    if (msgs && msgs.length > 0) out[key] = msgs[0] as string;
  }
  return out;
}

/**
 * Faol (ACTIVE) mijoz profili keyingi to'lov sanasisiz saqlanmasin — biznes
 * qoidasi: faol obuna doim to'lov tsikliga ega bo'lishi shart. `clientSchema`
 * ga `.superRefine()` sifatida ulanadi. PENDING/INACTIVE mijozlarga tegmaydi.
 */
export function requireActivePaymentDate(
  data: { status?: string | null; nextPaymentDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.status === "ACTIVE" && !data.nextPaymentDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nextPaymentDate"],
      message: "Faol mijoz uchun keyingi to'lov sanasi majburiy",
    });
  }
}

export const isCurrency = (v: unknown): boolean => currencyEnum.safeParse(v).success;
export const isClientStatus = (v: unknown): boolean => clientStatusEnum.safeParse(v).success;
export const isLeadOutcome = (v: unknown): boolean => leadOutcomeEnum.safeParse(v).success;
export const isLeadStage = (v: unknown): boolean => leadStageEnum.safeParse(v).success;
export const isTicketStatus = (v: unknown): boolean => ticketStatusEnum.safeParse(v).success;

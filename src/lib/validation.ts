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
} from "./constants";

/** Obyekt kalitlaridan z.enum uchun tuple yasaydi (manba — constants.ts). */
function keysOf(obj: Record<string, unknown>): [string, ...string[]] {
  return Object.keys(obj) as [string, ...string[]];
}

export const currencyEnum = z.enum(keysOf(CURRENCY)); // USD | UZS
export const clientStatusEnum = z.enum(keysOf(CLIENT_STATUS)); // ACTIVE | INACTIVE | PENDING
export const equipmentModeEnum = z.enum(keysOf(EQUIPMENT_MODE));
export const leadOutcomeEnum = z.enum(keysOf(LEAD_OUTCOME));
export const leadStageEnum = z.enum(keysOf(LEAD_STAGE));

/** Erkin matn maydonlari uchun cheklangan satr (DB bloat / abuse oldini oladi). */
export const noteString = z
  .string()
  .trim()
  .max(2000, "Izoh juda uzun (2000 belgidan oshmasin)");

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

export const isCurrency = (v: unknown): boolean => currencyEnum.safeParse(v).success;
export const isClientStatus = (v: unknown): boolean => clientStatusEnum.safeParse(v).success;
export const isLeadOutcome = (v: unknown): boolean => leadOutcomeEnum.safeParse(v).success;
export const isLeadStage = (v: unknown): boolean => leadStageEnum.safeParse(v).success;

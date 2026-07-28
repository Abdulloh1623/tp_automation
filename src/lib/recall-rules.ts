// Qayta aloqa qoidalari — operator tanlagan NATIJAga qarab mijoz bilan qachon
// qayta gaplashish kerakligini hisoblaydi. Sof mantiq (DB'siz, `Date.now()`siz):
// standart qiymatlar shu yerda, admin kiritganlari ular ustiga qo'yiladi.
//
// Nega bosqich emas, natija bo'yicha: operator aynan natijani tanlaydi va
// "Telefon o'chiq" bilan "Band" bir xil bosqichga tushsa ham, ular boshqacha
// muomalani talab qilishi mumkin.

import { addDays } from "date-fns";
import { LEAD_OUTCOME, type LeadOutcome } from "@/lib/constants";

export const RECALL_MODE = {
  DAYS: "Kun hisobida",
  PAYMENT_DATE: "To'lov sanasida",
  NONE: "Qayta aloqa yo'q",
} as const;
export type RecallMode = keyof typeof RECALL_MODE;

export function recallModeLabel(m: string): string {
  return RECALL_MODE[m as RecallMode] ?? m;
}

export type RecallRule = {
  mode: RecallMode;
  /** `DAYS` uchun — necha kundan keyin; `PAYMENT_DATE` uchun — zaxira qiymat. */
  days: number;
};

export type RecallRules = Record<LeadOutcome, RecallRule>;

export const MAX_RECALL_DAYS = 365;

/**
 * Standart qiymatlar — hozirgi (kodga qotib qolgan) xatti-harakatni AYNAN
 * takrorlaydi, ya'ni sozlamaga tegilmasa hech narsa o'zgarmaydi.
 *
 * `NONE` bu yerda "mijoz bilan boshqa gaplashilmaydi" degani emas — lid
 * operator taxtasidan chiqib boshqa oqimga (eskalatsiya, qaytarish, otkaz)
 * o'tadi va u yerda o'z jarayoni bilan yuriladi.
 */
export const DEFAULT_RECALL_RULES: RecallRules = {
  NO_ANSWER: { mode: "DAYS", days: 1 },
  PHONE_OFF: { mode: "DAYS", days: 1 },
  BUSY: { mode: "DAYS", days: 1 },
  CALL_LATER: { mode: "DAYS", days: 2 },
  WILL_PAY: { mode: "PAYMENT_DATE", days: 3 },
  WILL_PAY_TOMORROW: { mode: "DAYS", days: 1 },
  PAYMENT_REMINDED: { mode: "PAYMENT_DATE", days: 3 },
  FORWARDED: { mode: "NONE", days: 0 }, // boshliq eskalatsiya navbatiga
  HAS_ISSUE: { mode: "NONE", days: 0 }, // boshliq eskalatsiya navbatiga
  NO_PROBLEM: { mode: "DAYS", days: 4 },
  SUGGESTION: { mode: "DAYS", days: 4 },
  PAID: { mode: "PAYMENT_DATE", days: 30 },
  RESOLVED: { mode: "PAYMENT_DATE", days: 30 },
  RETURN_EQUIPMENT: { mode: "NONE", days: 0 }, // uskuna qaytarish navbatiga
  REFUSED: { mode: "NONE", days: 0 },
  DEACTIVATED: { mode: "NONE", days: 0 },
};

/** Operator taxtasidan chiqib ketadigan (boshqa oqimga o'tadigan) natijalar. */
export const OFF_BOARD_OUTCOMES: LeadOutcome[] = [
  "FORWARDED",
  "HAS_ISSUE",
  "RETURN_EQUIPMENT",
  "REFUSED",
  "DEACTIVATED",
];

export const ALL_OUTCOMES = Object.keys(LEAD_OUTCOME) as LeadOutcome[];

/** Noma'lum kalitni ham xavfsiz nomlaydi (xato matnlari uchun). */
export function leadOutcomeLabelSafe(key: string): string {
  return LEAD_OUTCOME[key as LeadOutcome] ?? key;
}

function isMode(v: unknown): v is RecallMode {
  return v === "DAYS" || v === "PAYMENT_DATE" || v === "NONE";
}

/**
 * Saqlangan (ishonchsiz) qiymatlarni standartlar ustiga qo'yadi. Noto'g'ri
 * yozuvlar jimgina e'tiborsiz qoldiriladi — bitta buzuq qator butun jadvalni
 * ishdan chiqarmasligi kerak.
 */
export function mergeRecallRules(raw: unknown): RecallRules {
  const merged: RecallRules = { ...DEFAULT_RECALL_RULES };
  if (!raw || typeof raw !== "object") return merged;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(key in DEFAULT_RECALL_RULES)) continue;
    if (!value || typeof value !== "object") continue;
    const v = value as { mode?: unknown; days?: unknown };
    if (!isMode(v.mode)) continue;
    const days = Number(v.days);
    if (!Number.isFinite(days) || days < 0 || days > MAX_RECALL_DAYS) continue;
    merged[key as LeadOutcome] = { mode: v.mode, days: Math.round(days) };
  }
  return merged;
}

/**
 * Natijaga ko'ra keyingi aloqa sanasi. `null` — lid operator taxtasidan chiqadi.
 *
 * `PAYMENT_DATE` rejimida mijozning to'lov sanasi olinadi; u yo'q bo'lsa
 * qoidadagi zaxira kun ishlatiladi (mijoz sanasiz qolib ketmasin).
 */
export function computeNextContact(
  outcome: LeadOutcome,
  client: { nextPaymentDate: Date | null },
  rules: RecallRules,
  now: Date = new Date(),
): Date | null {
  const rule = rules[outcome] ?? DEFAULT_RECALL_RULES[outcome];
  if (!rule || rule.mode === "NONE") return null;
  if (rule.mode === "PAYMENT_DATE") {
    return client.nextPaymentDate ?? addDays(now, rule.days);
  }
  return addDays(now, rule.days);
}

// --- Kunlik yuklama siyosati ---

export type LoadPolicy = {
  /** Operatorga eng kam kunlik lid; ro'yxat kam bo'lsa muddati yaqinlar tortiladi. 0 = tortmaslik. */
  minPerOperator: number;
  /** Operatorga eng ko'p kunlik lid — ortig'i ertaga qoladi. */
  maxPerOperator: number;
  /** Qarzdor bilan gaplashilgach, uni qayta ko'rsatmaslik oralig'i (kun). */
  debtorCooldownDays: number;
  /** Necha marta ketma-ket ko'tarmasa eskalatsiyaga o'tsin. */
  escalationThreshold: number;
};

export const DEFAULT_LOAD_POLICY: LoadPolicy = {
  minPerOperator: 10,
  maxPerOperator: 50,
  debtorCooldownDays: 3,
  escalationThreshold: 3,
};

export const LOAD_POLICY_BOUNDS = {
  minPerOperator: { min: 0, max: 500 },
  maxPerOperator: { min: 1, max: 500 },
  debtorCooldownDays: { min: 0, max: 90 },
  escalationThreshold: { min: 1, max: 20 },
} as const;

export function mergeLoadPolicy(raw: unknown): LoadPolicy {
  const merged: LoadPolicy = { ...DEFAULT_LOAD_POLICY };
  if (!raw || typeof raw !== "object") return merged;
  for (const key of Object.keys(DEFAULT_LOAD_POLICY) as (keyof LoadPolicy)[]) {
    const v = Number((raw as Record<string, unknown>)[key]);
    const b = LOAD_POLICY_BOUNDS[key];
    if (!Number.isFinite(v) || v < b.min || v > b.max) continue;
    merged[key] = Math.round(v);
  }
  // Eng kam eng ko'pdan oshib ketmasin (sozlamada xato bo'lsa ham).
  if (merged.minPerOperator > merged.maxPerOperator) {
    merged.minPerOperator = merged.maxPerOperator;
  }
  return merged;
}

/**
 * Operatorga bugungi avtomatik kvota: kunlik ro'yxat faol operatorlarga teng
 * bo'linadi va siyosat chegaralariga siqiladi.
 */
export function autoDailyLimit(
  dueCount: number,
  operatorCount: number,
  policy: LoadPolicy,
): number {
  if (operatorCount <= 0) return 0;
  const even = Math.ceil(dueCount / operatorCount);
  return Math.min(policy.maxPerOperator, Math.max(policy.minPerOperator, even));
}

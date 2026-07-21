// Eskalatsiya bosqichi yordamchilari — `escalatedAt` (3-kunlik SLA soati) va
// mas'ul (`escalationStaffId`) maydonlarini bosqich o'zgarganda to'g'ri boshqaradi.

import { BASE_PROGRAM_USD, ESCALATION_THRESHOLD } from "./constants";

/** SLA soatiga kiradigan eskalatsiya bosqichlari (navbat + ustada). */
export const ESCALATION_STAGES = ["ESCALATED", "FORWARDED"] as const;

/**
 * Ketma-ket ko'tarilmagan (kun bo'yicha sanalgan) qo'ng'iroqlar soniga qarab
 * mijoz avtomatik eskalatsiyaga o'tishi kerakmi. Chegara `>=` — ya'ni aynan
 * `ESCALATION_THRESHOLD`-ketma-ket ko'tarilmaganda ishga tushadi.
 */
export function shouldEscalate(consecutiveMissed: number): boolean {
  return consecutiveMissed >= ESCALATION_THRESHOLD;
}

export function isEscalationStage(stage: string | null | undefined): boolean {
  return !!stage && (ESCALATION_STAGES as readonly string[]).includes(stage);
}

// 29$ (USD) oylik to'lovli mijozlar — 3 marta ketma-ket ko'tarilmasa eskalatsiya
// EMAS, to'g'ridan-to'g'ri otkazga o'tadi (past qiymatli, ustaga chiqarishga arzimaydi).
// Bu — dasturning bazaviy narxi (BASE_PROGRAM_USD): uskunasiz, eng past qiymatli
// mijoz. Narx o'zgarsa constants.ts'dagi bitta joyda yangilanadi.
export const AUTO_REFUSE_USD_AMOUNT = BASE_PROGRAM_USD;

export type AutoEscalation = { stage: "ESCALATED" | "REFUSED"; note: string };

/**
 * Mijoz `missedCount` marta ketma-ket telefonni ko'tarmaganda avtomatik qayerga
 * o'tishini va tizim izohini qaytaradi:
 * - oylik to'lovi 29$ (USD) bo'lsa → OTKAZ (REFUSED) bo'limiga;
 * - aks holda → ESKALATSIYA (ESCALATED) navbatiga (boshliq ko'rigiga).
 * Izoh tarixda (CallLog) va eskalatsiya/otkaz ro'yxatida ko'rinadi.
 */
export function autoEscalationTarget(
  missedCount: number,
  monthlyAmount: number,
  currency: string,
): AutoEscalation {
  const is29Usd =
    currency === "USD" && Math.abs(monthlyAmount - AUTO_REFUSE_USD_AMOUNT) < 0.01;
  if (is29Usd) {
    return {
      stage: "REFUSED",
      note: `Tizim tomonidan otkazga o'tkazildi: mijoz ${missedCount} marta ketma-ket telefonni ko'tarmadi (oylik 29$).`,
    };
  }
  return {
    stage: "ESCALATED",
    note: `Tizim tomonidan eskalatsiyaga o'tkazildi: mijoz ${missedCount} marta ketma-ket telefonni ko'tarmadi.`,
  };
}

type EscalationPatch = {
  escalatedAt?: Date | null;
  escalationStaffId?: string | null;
  slaNotifiedAt?: Date | null;
};

/**
 * Mijoz `stage`i `target`ga o'zgarayotganda eskalatsiya vaqt-belgilarini hisoblaydi:
 * - eskalatsiyaga KIRSA — `escalatedAt` qo'yiladi (davom etayotgan bo'lsa saqlanadi),
 *   SLA belgisi nollanadi;
 * - eskalatsiyadan CHIQSA (RESOLVED/faol/otkaz) — `escalatedAt`, mas'ul va SLA
 *   belgilari tozalanadi.
 * Boshqa hollarda bo'sh patch (o'zgarish yo'q).
 */
export function escalationStagePatch(
  target: string,
  current: { stage: string; escalatedAt: Date | null },
): EscalationPatch {
  const entering = isEscalationStage(target);
  const wasEsc = isEscalationStage(current.stage);
  if (entering) {
    if (wasEsc && current.escalatedAt) return {}; // davom etyapti — vaqtni saqlaymiz
    return { escalatedAt: new Date(), slaNotifiedAt: null };
  }
  if (wasEsc || current.escalatedAt) {
    return { escalatedAt: null, escalationStaffId: null, slaNotifiedAt: null };
  }
  return {};
}

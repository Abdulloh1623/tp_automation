// Eskalatsiya bosqichi yordamchilari — `escalatedAt` (3-kunlik SLA soati) va
// mas'ul (`escalationStaffId`) maydonlarini bosqich o'zgarganda to'g'ri boshqaradi.

/** SLA soatiga kiradigan eskalatsiya bosqichlari (navbat + ustada). */
export const ESCALATION_STAGES = ["ESCALATED", "FORWARDED"] as const;

export function isEscalationStage(stage: string | null | undefined): boolean {
  return !!stage && (ESCALATION_STAGES as readonly string[]).includes(stage);
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

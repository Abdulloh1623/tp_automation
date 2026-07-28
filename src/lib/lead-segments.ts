// Lid segmentlari — kunlik fokus (ustuvorlik) mantig'ining SOF qismi.
// DB'siz, `Date.now()`siz (hozirgi vaqt argument bilan uzatiladi) — izolyatsiyada
// testlanadi va server komponentida ham, taqsimot yadrosida ham bir xil ishlaydi.

import {
  SEGMENT_RULES,
  type LeadSegment,
  type ProfileShare,
} from "@/lib/constants";
import { tzDaysBetween, tzDayKey } from "@/lib/tz";

/** Segmentlash uchun kerakli minimal mijoz maydonlari. */
export type SegmentInput = {
  stage: string;
  createdAt: Date;
  nextPaymentDate: Date | null;
  nextContactDate: Date | null;
  lastContactedAt: Date | null;
  missedCallCount: number;
  monthlyAmount: number;
  currency: string;
};

/** Kechikkan kunlar soni (qarzdor bo'lmasa 0). */
export function overdueDays(c: SegmentInput, now: Date): number {
  if (!c.nextPaymentDate) return 0;
  const d = tzDaysBetween(c.nextPaymentDate, now);
  return d > 0 ? d : 0;
}

function matches(segment: LeadSegment, c: SegmentInput, now: Date): boolean {
  const overdue = overdueDays(c, now);
  switch (segment) {
    case "DEBTOR_OLD":
      return overdue >= SEGMENT_RULES.debtorOldDays;
    case "DEBTOR":
      return overdue > 0;
    case "DUE_SOON": {
      if (!c.nextPaymentDate) return false;
      const left = tzDaysBetween(now, c.nextPaymentDate);
      return left >= 0 && left <= SEGMENT_RULES.dueSoonDays;
    }
    case "AWAITING_PAYMENT":
      return c.stage === "AWAITING_PAYMENT";
    case "NEW":
      return (
        c.stage === "NEW" ||
        tzDaysBetween(c.createdAt, now) <= SEGMENT_RULES.newClientDays
      );
    case "NO_ANSWER_2X":
      // 3-ketma-ket ko'tarilmaganda avto-eskalatsiya — undan oldin tutib qolish.
      return c.missedCallCount >= 2;
    case "FOLLOW_UP":
      return c.stage === "FOLLOW_UP";
    case "HIGH_VALUE":
      // Faqat USD — UZS mijozlar bu qoida bo'yicha tekshirilmaydi (BASE_PROGRAM_USD kabi).
      return c.currency === "USD" && c.monthlyAmount >= SEGMENT_RULES.highValueUsd;
    case "SILENT": {
      const from = c.lastContactedAt ?? c.createdAt;
      return tzDaysBetween(from, now) >= SEGMENT_RULES.silentDays;
    }
    case "OTHERS":
      return true;
  }
}

/**
 * Mijozni PROFIL tartibidagi birinchi mos segmentga joylaydi. Tartib profilga
 * qarab o'zgaradi — "Yirik mijozlar" profilida yirik mijoz qarzdordan oldin
 * tekshiriladi, "To'lov yig'ish"da esa aksincha. Hech biriga tushmasa `OTHERS`.
 */
export function classifyLead(
  c: SegmentInput,
  order: ProfileShare[],
  now: Date,
): LeadSegment {
  for (const { segment } of order) {
    if (matches(segment, c, now)) return segment;
  }
  return "OTHERS";
}

/**
 * Majburiy pol — profil qanday bo'lishidan qat'i nazar kunlik ro'yxatga tushadi:
 * (a) aynan BUGUNGA qayta-aloqa va'da qilingan lidlar (operator mijozga sana
 *     aytgan — uni fokus siqib chiqarmasligi kerak),
 * (b) `floorDebtorDays` dan ortiq qarzdorlar.
 * Pol ataylab tor — "muddati o'tgan har qanday va'da" desak, u butun hovuzni
 * yutib, fokusni ma'nosiz qilardi.
 */
export function isFloorLead(c: SegmentInput, now: Date): boolean {
  if (c.nextContactDate && tzDayKey(c.nextContactDate) === tzDayKey(now)) return true;
  return overdueDays(c, now) >= SEGMENT_RULES.floorDebtorDays;
}

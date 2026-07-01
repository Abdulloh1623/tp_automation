// Status va boshqa qiymatlarning markazlashgan ro'yxati + o'zbekcha yorliqlar.
// SQLite enum'ni qo'llamagani uchun bu yerda boshqaramiz.

export const CLIENT_STATUS = {
  ACTIVE: "Faol",
  INACTIVE: "O'chirilgan",
  PENDING: "Kutilmoqda",
} as const;
export type ClientStatus = keyof typeof CLIENT_STATUS;

export const CURRENCY = {
  USD: "$",
  UZS: "so'm",
} as const;
export type Currency = keyof typeof CURRENCY;

export const USER_ROLE = {
  ADMIN: "Administrator",
  MANAGER: "Texnik bo'lim boshlig'i",
  OPERATOR: "Texnik xodim",
  INSTALLER: "Usta",
} as const;
export type UserRole = keyof typeof USER_ROLE;

// Mijoz – texnika munosabati
export const EQUIPMENT_MODE = {
  RENTAL: "Ijara",
  SOLD: "Sotib olingan",
  PROGRAM_ONLY: "Dastur (texnikasiz)",
} as const;
export type EquipmentMode = keyof typeof EQUIPMENT_MODE;

export const OWNERSHIP = {
  RENTAL: "Ijara",
  SOLD: "Sotib olingan",
} as const;
export type Ownership = keyof typeof OWNERSHIP;

export function equipmentModeLabel(m: string): string {
  return EQUIPMENT_MODE[m as EquipmentMode] ?? m;
}
export function ownershipLabel(o: string): string {
  return OWNERSHIP[o as Ownership] ?? o;
}

export const CALL_RESULT = {
  TALKED: "Gaplashildi",
  NO_ANSWER: "Ko'tarmadi",
  PHONE_OFF: "Telefon o'chiq",
  BUSY: "Band (zaynit)",
  SMS_SENT: "SMS yuborildi",
  TELEGRAM_SENT: "Telegram yozildi",
  RESOLVED: "Muammo hal qilindi",
} as const;
export type CallResult = keyof typeof CALL_RESULT;

export const TICKET_STATUS = {
  OPEN: "Ochiq",
  IN_PROGRESS: "Jarayonda",
  RESOLVED: "Hal qilindi",
} as const;
export type TicketStatus = keyof typeof TICKET_STATUS;

export const TICKET_TYPE = {
  TECHNICAL: "Texnik",
  FEATURE: "Funksiya so'rovi",
  PAYMENT: "To'lov",
  TAX: "Soliq",
} as const;
export type TicketType = keyof typeof TICKET_TYPE;

export const TICKET_PRIORITY = {
  LOW: "Past",
  MEDIUM: "O'rta",
  HIGH: "Yuqori",
} as const;
export type TicketPriority = keyof typeof TICKET_PRIORITY;

// --- Lid workflow (kunlik qo'ng'iroq jarayoni) ---

// Lid bo'limlari (board ustunlari / joriy holat)
export const LEAD_STAGE = {
  NEW: "Bugun qo'ng'iroq",
  NO_ANSWER: "Ko'tarmadi",
  LATER: "Keyinroq",
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  ESCALATED: "Eskalatsiya navbati", // boshliq ko'rigida, ustaga biriktirilmoqda
  FORWARDED: "Ustada (yo'naltirilgan)",
  RETURNING: "Uskuna qaytarilmoqda", // boshliqning qaytarish navbatida
  RESOLVED: "Hal qilindi",
  DEACTIVATED: "O'chirilgan",
} as const;
export type LeadStage = keyof typeof LEAD_STAGE;

// Kunlik ish ro'yxatida ko'rinadigan (faol) bo'limlar tartibi.
// ESCALATED (boshliq navbati) va FORWARDED (ustada) operator boardidan chiqadi.
export const ACTIVE_STAGES: LeadStage[] = [
  "NEW",
  "NO_ANSWER",
  "LATER",
  "AWAITING_PAYMENT",
];

// Xodim tanlaydigan qo'ng'iroq natijasi
export const LEAD_OUTCOME = {
  NO_ANSWER: "Ko'tarmadi",
  PHONE_OFF: "Telefon o'chiq",
  BUSY: "Band (zaynit)",
  CALL_LATER: "Keyinroq tel qilish",
  WILL_PAY: "To'lov qiladi",
  WILL_PAY_TOMORROW: "Ertaga to'lov qiladi",
  PAYMENT_REMINDED: "Oylik to'lov eslatildi",
  FORWARDED: "Yo'naltirildi",
  HAS_ISSUE: "Muammo bor",
  NO_PROBLEM: "Muammo yo'q",
  PAID: "To'lov qildi",
  RESOLVED: "Muammo hal qilindi",
  RETURN_EQUIPMENT: "Uskuna qaytarish kerak",
  DEACTIVATED: "O'chirib qo'ydi",
} as const;
export type LeadOutcome = keyof typeof LEAD_OUTCOME;

// Natija -> kun-yakuni maqsad bo'lim
export const OUTCOME_TO_STAGE: Record<LeadOutcome, LeadStage> = {
  NO_ANSWER: "NO_ANSWER",
  PHONE_OFF: "NO_ANSWER",
  BUSY: "NO_ANSWER",
  CALL_LATER: "LATER",
  WILL_PAY: "AWAITING_PAYMENT",
  WILL_PAY_TOMORROW: "AWAITING_PAYMENT",
  PAYMENT_REMINDED: "AWAITING_PAYMENT",
  FORWARDED: "ESCALATED", // boshliq navbatiga (avval boshliqqa)
  HAS_ISSUE: "ESCALATED",
  NO_PROBLEM: "RESOLVED",
  PAID: "RESOLVED",
  RESOLVED: "RESOLVED",
  RETURN_EQUIPMENT: "RETURNING", // boshliqning qaytarish navbatiga
  DEACTIVATED: "DEACTIVATED",
};

// Ko'tarilmagan (muvaffaqiyatsiz aloqa) natijalari — hisoblanadi
export const MISSED_OUTCOMES: LeadOutcome[] = ["NO_ANSWER", "PHONE_OFF", "BUSY"];

// "Gaplashildi" hisoblanadigan CallLog natijalari — operator mijozga haqiqatan
// yetgan (ko'tarmadi/o'chiq/band EMAS). Jonli dashboard "gaplashilgan mijozlar"
// sonini shu bo'yicha sanaydi — operator lid holatini o'zgartirsa +1 bo'ladi.
export const TALKED_RESULTS: string[] = [
  ...(Object.keys(LEAD_OUTCOME) as LeadOutcome[]).filter(
    (k) => !MISSED_OUTCOMES.includes(k),
  ),
  "TALKED", // qo'lda qo'ng'iroq jurnalidagi "Gaplashildi"
];

// Shu sondan ko'p ketma-ket ko'tarilmasa, avtomatik ustaga (FORWARDED) yo'naltiriladi
export const ESCALATION_THRESHOLD = 3;

// Operatorning gaplashgan lidlar bo'yicha limiti (6 ish kuni: kunlik 50 → hafta 300, oy ≈1300)
export const LEAD_LIMITS = {
  daily: 50,
  weekly: 300,
  monthly: 1300,
} as const;

// Usta (dala texnigi) vazifa holati
export const USTA_STATUS = {
  ASSIGNED: "Biriktirildi",
  EN_ROUTE: "Yo'ldaman",
  ARRIVED: "Bordim",
  DONE: "Bajarildi",
  FAILED: "Hal bo'lmadi",
  REVISIT: "Qayta kerak",
} as const;
export type UstaStatus = keyof typeof USTA_STATUS;

// Usta tugmalarida ko'rinadigan holatlar (ASSIGNED admin tomonidan qo'yiladi)
export const USTA_ACTION_STATUSES: UstaStatus[] = [
  "EN_ROUTE",
  "ARRIVED",
  "DONE",
  "FAILED",
  "REVISIT",
];

export function ustaStatusLabel(s: string): string {
  return USTA_STATUS[s as UstaStatus] ?? s;
}

export function leadStageLabel(stage: string): string {
  return LEAD_STAGE[stage as LeadStage] ?? stage;
}

export function leadOutcomeLabel(outcome: string): string {
  return LEAD_OUTCOME[outcome as LeadOutcome] ?? outcome;
}

// O'zbekiston viloyatlari (filtr uchun) — yagona kanonik ro'yxat.
// Eslatma: real data Toshkent shahar/viloyatni ajratmaydi, shuning uchun "Toshkent".
export const REGIONS = [
  "Toshkent",
  "Andijon",
  "Buxoro",
  "Farg'ona",
  "Jizzax",
  "Xorazm",
  "Namangan",
  "Navoiy",
  "Qashqadaryo",
  "Qoraqalpog'iston",
  "Samarqand",
  "Sirdaryo",
  "Surxondaryo",
] as const;

/**
 * Viloyat qiymatini kanonik ko'rinishga keltiradi: apostrof variantlarini
 * birlashtiradi, imlo/eski variantlarni (Surxandaryo, Toshkent shahri...)
 * REGIONS dagi yagona qiymatga moslaydi. Filtr/hisobot izchilligi uchun.
 */
export function normalizeRegion(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw
    .trim()
    .replace(/[‘’ʻʼ`´]/g, "'") // turli apostroflar -> ASCII '
    .replace(/\s+/g, " ");
  if (!s) return null;
  const lower = s.toLowerCase();
  const map: Record<string, string> = {
    "toshkent shahri": "Toshkent",
    "toshkent shahar": "Toshkent",
    "toshkent viloyati": "Toshkent",
    "toshkent": "Toshkent",
    "qoraqalpog'ston": "Qoraqalpog'iston",
    "qoraqalpog'iston": "Qoraqalpog'iston",
    "qoraqalpoq": "Qoraqalpog'iston",
    "surxandaryo": "Surxondaryo",
    "surxondaryo": "Surxondaryo",
    "sirdaryo": "Sirdaryo",
    "farg'ona": "Farg'ona",
    "fargona": "Farg'ona",
  };
  if (map[lower]) return map[lower];
  const canon = REGIONS.find((r) => r.toLowerCase() === lower);
  return canon ?? s;
}

/**
 * Foydalanuvchi (usta/xodim) qoplaydigan viloyatlar ro'yxati.
 * Yangi `regions` (vergulli) + eski `region` ni birlashtiradi (orqaga moslik).
 */
export function parseRegions(regions?: string | null, region?: string | null): string[] {
  const set = new Set<string>();
  if (regions) for (const r of regions.split(",").map((s) => s.trim()).filter(Boolean)) set.add(r);
  if (region && region.trim()) set.add(region.trim());
  return [...set];
}

export function currencySymbol(currency: string): string {
  return CURRENCY[currency as Currency] ?? currency;
}

export function clientStatusLabel(status: string): string {
  return CLIENT_STATUS[status as ClientStatus] ?? status;
}

export function callResultLabel(result: string): string {
  return (
    CALL_RESULT[result as CallResult] ??
    LEAD_OUTCOME[result as LeadOutcome] ??
    USTA_STATUS[result as UstaStatus] ??
    (result === "ASSIGNED" ? "Ustaga biriktirildi" : result)
  );
}

export function userRoleLabel(role: string): string {
  return USER_ROLE[role as UserRole] ?? role;
}

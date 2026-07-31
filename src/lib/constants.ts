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

// To'lov usuli — chek qabul qilishda tanlanadi (izoh o'rniga)
export const PAYMENT_METHOD = {
  CARD: "Karta orqali",
  QR: "QR kod orqali",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHOD;

export function paymentMethodLabel(m?: string | null): string {
  return PAYMENT_METHOD[m as PaymentMethod] ?? (m ?? "");
}

// Kartaga dostupi bor xodim tasdig'idan o'tadigan usullar. Bu usullarda pul
// kartaga TUSHGANINI faqat karta egasi ko'ra oladi — shu sabab to'lov u
// tasdiqlagunicha "kutilmoqda" holatida turadi (lib/card-payment.ts).
export const CARD_CONFIRM_METHODS = ["CARD", "QR"] as const;

// Karta to'lovini tasdiqlash navbatining holati
export const CARD_REQUEST_STATUS = {
  PENDING: "Tasdiq kutilmoqda",
  CONFIRMED: "Tasdiqlandi",
  REJECTED: "Rad etildi",
} as const;
export type CardRequestStatus = keyof typeof CARD_REQUEST_STATUS;

// Rad etish sabablari — botda tugma sifatida chiqadi (matn yozish shart emas)
export const CARD_REJECT_REASON = {
  NO_MONEY: "Pul kartaga tushmadi",
  WRONG_AMOUNT: "Summa mos kelmadi",
  OTHER: "Boshqa sabab",
} as const;
export type CardRejectReason = keyof typeof CARD_REJECT_REASON;

export function cardRejectReasonLabel(r?: string | null): string {
  return CARD_REJECT_REASON[r as CardRejectReason] ?? (r ?? "");
}

// Ustaga topshirish rejimi — hujjat bilan (imzolangan hujjat yuklanadi) yoki
// hujjatsiz (izoh majburiy).
export const HANDOUT_MODE = {
  WITH_DOC: "Hujjat bilan yuborish",
  WITHOUT_DOC: "Hujjatsiz yuborish",
} as const;
export type HandoutMode = keyof typeof HANDOUT_MODE;

// Topshirish hujjati holati (EquipmentMovement.documentStatus)
export const DOCUMENT_STATUS = {
  PENDING_DOC: "Imzo kutilmoqda",
  UPLOADED: "Yuklandi",
  APPROVED: "Tasdiqlandi",
  NOT_REQUIRED: "Talab qilinmaydi",
} as const;
export type DocumentStatus = keyof typeof DOCUMENT_STATUS;

export function documentStatusLabel(s?: string | null): string {
  return DOCUMENT_STATUS[s as DocumentStatus] ?? (s ?? "");
}

export const USER_ROLE = {
  ADMIN: "Administrator",
  MANAGER: "Texnik bo'lim boshlig'i",
  OPERATOR: "Texnik xodim",
  INSTALLER: "Usta",
} as const;
export type UserRole = keyof typeof USER_ROLE;

// Ish smenasi (operator) — tablo shu bo'yicha filtrlaydi
export const USER_SHIFT = {
  DAY: "Kunduzgi (09:00–18:00)",
  NIGHT: "Kechki (18:00–09:00)",
} as const;
export type UserShift = keyof typeof USER_SHIFT;
export function isUserShift(v: string): v is UserShift {
  return v === "DAY" || v === "NIGHT";
}

/**
 * Smena hisobotlari (UTC+5). Kunlik hisobot ikkiga bo'lingan: kunduzgi smena
 * 17:30 da yuboriladi va 09:30 dan beri bo'lgan ishni ko'rsatadi; kechki smena
 * 09:30 da yuboriladi va kecha 17:30 dan beri.
 *
 * Oynalar ataylab yuborish vaqtlariga bog'langan — smenaning nominal chegarasiga
 * (09:00/18:00) emas. Aks holda 17:30–18:00 oralig'i hech qaysi hisobotga
 * tushmasdi; hozirgi ko'rinishda ikki oyna uzluksiz 24 soatni qoplaydi.
 *
 * cron jadvali ham shu yerdan quriladi (`scripts/bot.ts`) — vaqtlar bir joyda.
 */
export const SHIFT_REPORT = {
  DAY: { sendHour: 17, sendMinute: 30, startHour: 9, startMinute: 30 },
  NIGHT: { sendHour: 9, sendMinute: 30, startHour: 17, startMinute: 30 },
} as const;

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

// Mijoz taklifi holati
export const SUGGESTION_STATUS = {
  OPEN: "Ochiq",
  RESOLVED: "Hal qilindi",
} as const;
export type SuggestionStatus = keyof typeof SUGGESTION_STATUS;

// Soliqqa ulash arizasi holati
export const TAX_CONNECTION_STATUS = {
  PENDING: "Kutilmoqda",
  CONNECTED: "Ulandi",
} as const;
export type TaxConnectionStatus = keyof typeof TAX_CONNECTION_STATUS;

export function suggestionStatusLabel(s: string): string {
  return SUGGESTION_STATUS[s as SuggestionStatus] ?? s;
}

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

// Muammoni kim hal qiladi — usta (joyida) yoki xodim (online)
export const TICKET_ASSIGNEE_TYPE = {
  USTA: "Ustaga (joyida hal etish)",
  XODIM: "Xodimga (online hal etish)",
} as const;
export type TicketAssigneeType = keyof typeof TICKET_ASSIGNEE_TYPE;

// --- Lid workflow (kunlik qo'ng'iroq jarayoni) ---

// Lid bo'limlari (board ustunlari / joriy holat)
export const LEAD_STAGE = {
  NEW: "Bugun qo'ng'iroq",
  NO_ANSWER: "Ko'tarmadi",
  LATER: "Keyinroq",
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  FOLLOW_UP: "Kuzatuv", // "muammo yo'q" — oraliq /sozlamalar da
  ISSUE_OPEN: "Muammo ochiq", // ticket ochilgan, operator o'zi kuzatadi
  ESCALATED: "Eskalatsiya navbati", // boshliq ko'rigida, ustaga biriktirilmoqda
  FORWARDED: "Ustada (yo'naltirilgan)",
  RETURNING: "Uskuna qaytarilmoqda", // boshliqning qaytarish navbatida
  RESOLVED: "Hal qilindi",
  REFUSED: "Otkaz (bekor qilgan)", // mijoz xizmatdan voz kechdi
  DEACTIVATED: "O'chirilgan",
} as const;
export type LeadStage = keyof typeof LEAD_STAGE;

// Kunlik ish ro'yxatida ko'rinadigan (faol) bo'limlar tartibi.
// ESCALATED (boshliq navbati), FORWARDED (ustada) va RETURNING (qaytarish
// navbati) operator boardidan chiqadi — u yerda o'z jarayoni bilan yuriladi.
// DEACTIVATED (dasturni o'chirib qo'ygan) esa QOLADI: mijozni qaytarib olishga
// urinamiz, shuning uchun u ham kunlik ro'yxatga tushadi.
export const ACTIVE_STAGES: LeadStage[] = [
  "NEW",
  "NO_ANSWER",
  "LATER",
  "AWAITING_PAYMENT",
  "FOLLOW_UP",
  "ISSUE_OPEN",
  "DEACTIVATED",
];

// Aloqa qilinmaydigan (workflow'dan butunlay chiqqan) bosqich — faqat OTKAZ.
// Qarzdor bo'lsa ham kunlik ishga/taqsimotga/eslatmaga CHIQMAYDI.
export const NO_CONTACT_STAGES: LeadStage[] = ["REFUSED"];

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
  SUGGESTION: "Taklif bildirdi",
  PAID: "To'lov qildi",
  RESOLVED: "Muammo hal qilindi",
  RETURN_EQUIPMENT: "Uskuna qaytarish kerak",
  REFUSED: "Otkaz (bekor qildi)",
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
  // "Muammo bor" — Muammolar bo'limiga ticket ochiladi, LEKIN lid operatorda
  // qoladi va kelishilgan oraliqda o'zi kuzatadi (eskalatsiya faqat
  // "Yo'naltirildi" orqali bo'ladi).
  HAS_ISSUE: "ISSUE_OPEN",
  NO_PROBLEM: "FOLLOW_UP", // oraliq /sozlamalar da
  SUGGESTION: "FOLLOW_UP",
  PAID: "RESOLVED",
  RESOLVED: "RESOLVED",
  RETURN_EQUIPMENT: "RETURNING", // boshliqning qaytarish navbatiga
  REFUSED: "REFUSED", // otkaz — bekor qilganlar bo'limiga
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

// Shu SONDA (yoki ko'proq) ketma-ket ko'tarilmasa, avtomatik eskalatsiya navbatiga
// (ESCALATED) o'tadi. Chegara `>=` bilan tekshiriladi — ya'ni aynan 3-ketma-ket
// ko'tarilmaganда ishlaydi (kun bo'yicha sanaladi, bir kunда nechta urinish bo'lsa ham 1).
export const ESCALATION_THRESHOLD = 3;

// Yangi parol uchun eng kam uzunlik. Login'ga ta'sir qilmaydi (mavjud parollar
// ishlayveradi) — faqat parol o'rnatish/almashtirish joylarida tekshiriladi.
// Yuqori chegara ham bor: bcrypt juda uzun matn ustida ishlashi CPU'ni yeydi.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Chek rasmining eng katta hajmi. Serverda (`lib/receipts.ts`) VA formada
// (`components/receipt-input.tsx`) bir xil raqam ishlatilsin — aks holda
// foydalanuvchi katta faylni tanlab, "Saqlash" bosgandan keyingina xato oladi.
export const RECEIPT_MAX_MB = 5;

// Oy nomlari (o'zbekcha) — moliya va uskuna analitikasi grafiklari uchun.
export const UZBEK_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

// Dasturning standart oylik narxi (USD). Biznes qoidasi: shu summani to'layotgan
// mijoz FAQAT dasturdan foydalanadi — uskuna ijaraga olmagan. Undan ORTIQ
// to'lasa — farq uskuna ijarasi, ya'ni mijozda ijara uskunasi bo'lishi shart.
// (Narx kelajakda o'zgarishi mumkin — o'shanda faqat shu qiymat yangilanadi.)
// Faqat USD uchun amal qiladi; UZS mijozlar bu qoida bo'yicha tekshirilmaydi.
export const BASE_PROGRAM_USD = 29;

// Tablodagi hafta/oy o'lchagichlari uchun ko'rsatkich normalari.
// KUNLIK kvota bu yerda YO'Q — u har operatorning o'ziniki (`User.dailyLimit`,
// ustiga bir kunlik `DailyLeadGrant`). Ilgari bu yerdagi global 50 taqsimotda
// ishlatilib, xodimning shaxsiy kvotasi (20) bilan zid kelardi.
export const LEAD_LIMITS = {
  weekly: 300,
  monthly: 1300,
} as const;

// --- Kunlik fokus (lid ustuvorligi) ---
//
// Kunlik taqsimotda hovuz segmentlarga bo'linadi va admin tanlagan PROFIL
// bo'yicha har operatorning kunlik kvotasi shu segmentlardan ULUSH bilan
// to'ldiriladi. Filtr EMAS — ulush: "bugun to'lov" desa ham yangi mijoz yoki
// kuzatuv muddati kelgan lid butunlay tushib qolmaydi.

export const LEAD_SEGMENT = {
  DEBTOR_OLD: "Eski qarzdor",
  DEBTOR: "Qarzdor",
  DUE_SOON: "To'lov yaqin",
  AWAITING_PAYMENT: "Va'da bergan",
  NEW: "Yangi mijoz",
  NO_ANSWER_2X: "2× ko'tarmagan",
  FOLLOW_UP: "Kuzatuv",
  HIGH_VALUE: "Yirik mijoz",
  SILENT: "Uzoq jim",
  OTHERS: "Boshqalar",
} as const;
export type LeadSegment = keyof typeof LEAD_SEGMENT;

export function leadSegmentLabel(s: string): string {
  return LEAD_SEGMENT[s as LeadSegment] ?? s;
}

// Segment chegaralari — biznes qoidasi bir joyda.
export const SEGMENT_RULES = {
  debtorOldDays: 30, // shu kundan ortiq qarz — "eski qarzdor"
  dueSoonDays: 3, // to'lovga shuncha kun qolgan (hali qarz emas)
  newClientDays: 14, // shu kun ichida qo'shilgan mijoz — "yangi"
  highValueUsd: 100, // oylik shu summadan yuqori — "yirik"
  silentDays: 30, // shu kundan beri aloqa yo'q — "uzoq jim"
  // Majburiy pol: profildan QAT'I NAZAR kunlik ro'yxatga tushadigan lidlar —
  // (a) aynan bugunga qayta-aloqa va'da qilinganlar, (b) shu kundan ortiq qarzdorlar.
  // Pol chegaralangan bo'lishi shart, aks holda u butun hovuzni yutib, fokus
  // ma'nosiz bo'lib qoladi (shu bois "muddati o'tgan va'da" emas, "aynan bugun").
  floorDebtorDays: 60,
} as const;

export type ProfileShare = { segment: LeadSegment; share: number };

// Profil = segmentlarning TARTIBLANGAN ulushlari. Tartib ikki vazifani bajaradi:
// (1) mijoz qaysi segmentga tushishi — birinchi mos kelgan segment yutadi,
// (2) kvota to'ldirish va operator board'idagi saralash tartibi.
// `OTHERS` har doim oxirgi va qolgan hamma narsani ushlaydi (yig'indi = 100).
export const LEAD_PRIORITY_PROFILES = {
  BALANCED: {
    label: "Muvozanat",
    hint: "Kundalik odatiy tartib — qarz, va'da, yangi mijoz aralash",
    shares: [
      { segment: "DEBTOR_OLD", share: 20 },
      { segment: "DEBTOR", share: 20 },
      { segment: "AWAITING_PAYMENT", share: 15 },
      { segment: "NEW", share: 15 },
      { segment: "FOLLOW_UP", share: 10 },
      { segment: "OTHERS", share: 20 },
    ],
  },
  PAYMENT: {
    label: "To'lov yig'ish",
    hint: "Qarzdorlar va to'lov va'da qilganlar birinchi o'rinda",
    shares: [
      { segment: "DEBTOR_OLD", share: 30 },
      { segment: "DEBTOR", share: 25 },
      { segment: "AWAITING_PAYMENT", share: 25 },
      { segment: "DUE_SOON", share: 10 },
      { segment: "OTHERS", share: 10 },
    ],
  },
  NEW_CLIENTS: {
    label: "Yangi mijozlar",
    hint: "Yangi qo'shilgan mijozlar bilan tanishuv va kuzatuv",
    shares: [
      { segment: "NEW", share: 50 },
      { segment: "FOLLOW_UP", share: 20 },
      { segment: "DEBTOR_OLD", share: 10 },
      { segment: "DEBTOR", share: 10 },
      { segment: "OTHERS", share: 10 },
    ],
  },
  REENGAGE: {
    label: "Aloqani tiklash",
    hint: "Uzoq gaplashilmagan va telefon ko'tarmayotgan mijozlar",
    shares: [
      { segment: "SILENT", share: 40 },
      { segment: "NO_ANSWER_2X", share: 30 },
      { segment: "DEBTOR_OLD", share: 10 },
      { segment: "DEBTOR", share: 10 },
      { segment: "OTHERS", share: 10 },
    ],
  },
  HIGH_VALUE: {
    label: "Yirik mijozlar",
    hint: "Oylik to'lovi yuqori mijozlarga alohida e'tibor",
    shares: [
      { segment: "HIGH_VALUE", share: 50 },
      { segment: "DEBTOR_OLD", share: 15 },
      { segment: "DEBTOR", share: 15 },
      { segment: "OTHERS", share: 20 },
    ],
  },
} as const satisfies Record<string, { label: string; hint: string; shares: readonly ProfileShare[] }>;

export type LeadProfileId = keyof typeof LEAD_PRIORITY_PROFILES;

// Admin hech narsa tanlamaganda ishlaydigan profil.
export const DEFAULT_LEAD_PROFILE: LeadProfileId = "BALANCED";

export function isLeadProfileId(v: unknown): v is LeadProfileId {
  return typeof v === "string" && v in LEAD_PRIORITY_PROFILES;
}

export function leadProfileLabel(id: string): string {
  return isLeadProfileId(id) ? LEAD_PRIORITY_PROFILES[id].label : id;
}

/** Profil segmentlari — tartiblangan (klassifikatsiya + saralash uchun). */
export function profileOrder(id: LeadProfileId): ProfileShare[] {
  return LEAD_PRIORITY_PROFILES[id].shares.map((s) => ({ ...s }));
}

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

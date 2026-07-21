// Ommaviy yuklash — shablon ta'riflari.
//
// Har bir tur uchun: qanday ustunlar bo'ladi, qaysilari majburiy, namuna
// qiymat va izoh. Shablon (XLSX) SHU ta'rifdan generatsiya qilinadi, fayl ham
// SHU ta'rif bo'yicha o'qiladi — ya'ni shablon va o'qish hech qachon bir-biridan
// ajralib ketmaydi.
//
// Bu fayl SOF ma'lumot va sof funksiyalar — bazaga tegmaydi, to'liq testlanadi.

import { IMPORT_FIELDS } from "@/lib/import-fields";

export type ColumnDef = {
  key: string;
  label: string;
  required: boolean;
  /** Shablondagi namuna qatorida turadigan qiymat. */
  example: string;
  /** Ko'rsatma varag'idagi izoh. */
  hint?: string;
};

export type BulkEntityKey = "mijozlar" | "tolovlar" | "uskuna" | "xodimlar";

export type EntityDef = {
  key: BulkEntityKey;
  title: string;
  description: string;
  sheetName: string;
  columns: ColumnDef[];
  /** Ko'rsatma varag'iga chiqadigan umumiy qoidalar. */
  notes: string[];
};

/** Mijoz qidiruv ustunlari — uch turda ham bir xil ishlatiladi. */
const CLIENT_LOOKUP: ColumnDef[] = [
  {
    key: "clientPhone",
    label: "Mijoz telefoni",
    required: false,
    example: "998901234567",
    hint: "Mijozni topish uchun. Telefon, shartnoma raqami yoki restoran nomidan KAMIDA BITTASI to'ldirilishi shart.",
  },
  {
    key: "clientContract",
    label: "Shartnoma raqami",
    required: false,
    example: "TP-104",
    hint: "Mijozni topishning eng ishonchli usuli.",
  },
  {
    key: "clientName",
    label: "Restoran nomi",
    required: false,
    example: "Chaykhana Lazzat",
    hint: "Bir xil nomli mijoz bo'lsa qator o'tkazib yuboriladi — telefon yoki shartnoma ishlating.",
  },
];

// Mijozlar shabloni mavjud CSV import maydonlaridan quriladi — ikkala yo'l
// (shablon va erkin CSV) bir xil maydonlarni tushunishi uchun.
const CLIENT_EXAMPLES: Record<string, string> = {
  fullName: "Valiyev Ali",
  restaurantName: "Chaykhana Lazzat",
  phone: "998901234567",
  region: "Toshkent shahri",
  phoneSecondary: "998911234567",
  contractNumber: "TP-104",
  contractDate: "2026-01-15",
  installerName: "Aziz",
  monoblokCount: "1",
  equipment: "Monoblok",
  monthlyAmount: "29",
  currency: "USD",
  nextPaymentDate: "2026-08-15",
  debtAmount: "0",
  lastPaymentAmount: "29",
  lastPaymentDate: "2026-07-15",
  equipmentType: "Monoblok",
  equipmentQty: "1",
  equipmentOwnership: "ijara",
  status: "ACTIVE",
  notes: "",
  operator: "Asadbek",
};

export const ENTITIES: Record<BulkEntityKey, EntityDef> = {
  mijozlar: {
    key: "mijozlar",
    title: "Mijozlar",
    description: "Mijozlar bazasini ommaviy kiritish yoki yangilash",
    sheetName: "Mijozlar",
    columns: IMPORT_FIELDS.map((f) => ({
      key: f.key,
      label: f.label,
      required: f.required,
      example: CLIENT_EXAMPLES[f.key] ?? "",
    })),
    notes: [
      "Telefon raqami bo'yicha mavjud mijoz topilsa — yangilanadi, topilmasa yangi qo'shiladi.",
      "Sanalar: YYYY-MM-DD (masalan 2026-01-15).",
      "Valyuta: USD yoki UZS. Bo'sh qoldirilsa USD deb olinadi.",
      "Holat (status): ACTIVE, INACTIVE yoki PENDING.",
      "Uskuna egaligi: ijara yoki sotuv.",
    ],
  },

  tolovlar: {
    key: "tolovlar",
    title: "To'lovlar",
    description: "Tarixiy to'lovlarni ommaviy kiritish (chek talab qilinmaydi)",
    sheetName: "To'lovlar",
    columns: [
      ...CLIENT_LOOKUP,
      {
        key: "amount",
        label: "Summa",
        required: true,
        example: "29",
        hint: "Faqat son. Ajratuvchi belgilarsiz: 350000 (350 000 emas).",
      },
      {
        key: "currency",
        label: "Valyuta",
        required: false,
        example: "USD",
        hint: "USD yoki UZS. Bo'sh bo'lsa mijozning valyutasi olinadi.",
      },
      {
        key: "paidAt",
        label: "To'lov sanasi",
        required: true,
        example: "2026-07-15",
        hint: "YYYY-MM-DD ko'rinishida.",
      },
      {
        key: "method",
        label: "To'lov usuli",
        required: false,
        example: "Karta",
        hint: "Karta yoki QR. Bo'sh qoldirilishi mumkin.",
      },
      {
        key: "note",
        label: "Izoh",
        required: false,
        example: "Iyul oyi uchun",
        hint: "Ixtiyoriy.",
      },
    ],
    notes: [
      "DIQQAT: bu yo'l bilan kiritilgan to'lovlarda CHEK BO'LMAYDI. U faqat tarixiy ma'lumotni kiritish uchun.",
      "Yangi to'lovlar odatdagidek /tolovlar sahifasidan, chek bilan kiritilishi kerak.",
      "Har bir yozuv audit jurnaliga \"ommaviy yuklash\" belgisi bilan tushadi.",
      "Bir xil mijoz + sana + summa allaqachon bo'lsa — qator o'tkazib yuboriladi (takror yozilmaydi).",
      "To'lov mijozning keyingi to'lov sanasini SURMAYDI — tarixiy ma'lumot shunchaki qayd etiladi.",
    ],
  },

  uskuna: {
    key: "uskuna",
    title: "Uskuna (ijara/sotuv)",
    description: "Mijozlardagi uskunani shartnomalar bo'yicha to'ldirish",
    sheetName: "Uskuna",
    columns: [
      ...CLIENT_LOOKUP,
      {
        key: "equipmentType",
        label: "Texnika turi",
        required: true,
        example: "Monoblok",
        hint: "Ombor bo'limidagi tur nomi bilan AYNAN bir xil bo'lishi kerak.",
      },
      {
        key: "quantity",
        label: "Soni",
        required: true,
        example: "2",
        hint: "0 yozilsa — mijozdagi shu turdagi uskuna yozuvi o'chiriladi.",
      },
      {
        key: "ownership",
        label: "Egaligi",
        required: false,
        example: "ijara",
        hint: "ijara yoki sotuv. Bo'sh bo'lsa — ijara.",
      },
    ],
    notes: [
      "Mavjud miqdor fayldagi songa TENGLASHTIRILADI (ustiga qo'shilmaydi) — qayta yuklash xavfsiz.",
      "Ombor qoldig'iga (InventoryStock) TEGILMAYDI: bular tarixiy o'rnatishlar, ular sklad hisobidan allaqachon chiqqan.",
      "Oylik to'lovga (monthlyAmount) TEGILMAYDI: ijara — oylik to'lov ICHIDAGI ulush, ustiga qo'shilmaydi.",
      "Biznes qoidasi: oyligi aynan 29$ bo'lgan mijozda ijara uskunasi BO'LMASLIGI kerak.",
    ],
  },

  xodimlar: {
    key: "xodimlar",
    title: "Xodimlar",
    description: "Operator, menejer va ustalarni ommaviy qo'shish",
    sheetName: "Xodimlar",
    columns: [
      { key: "name", label: "F.I.Sh", required: true, example: "Asadbek Rahimov" },
      {
        key: "username",
        label: "Login",
        required: false,
        example: "asadbek",
        hint: "Faqat lotin harflari va raqamlar. USTA (INSTALLER) uchun kerak emas — ular tizimga kirmaydi.",
      },
      {
        key: "role",
        label: "Rol",
        required: true,
        example: "OPERATOR",
        hint: "ADMIN, MANAGER, OPERATOR yoki INSTALLER (usta).",
      },
      { key: "phone", label: "Telefon", required: false, example: "998901234567" },
      {
        key: "regions",
        label: "Viloyatlar",
        required: false,
        example: "Toshkent shahri, Toshkent viloyati",
        hint: "Bir nechta bo'lsa vergul bilan ajrating.",
      },
      {
        key: "shift",
        label: "Smena",
        required: false,
        example: "DAY",
        hint: "DAY yoki NIGHT. Bo'sh bo'lsa DAY.",
      },
      {
        key: "dailyLeadTarget",
        label: "Kunlik lid rejasi",
        required: false,
        example: "20",
        hint: "Faqat operatorlar uchun. Bo'sh bo'lsa 20.",
      },
    ],
    notes: [
      "PAROL USTUNI YO'Q — bu ataylab. Fayl ichida parol saqlash uni ochiq qoldirish demak.",
      "Dastur har bir xodimga tasodifiy parol yaratadi va yuklashdan keyin BIR MARTA ro'yxat qilib ko'rsatadi.",
      "O'sha ro'yxatni nusxa olib, xodimlarga xavfsiz kanal orqali yetkazing — sahifa yopilgach parollar qayta ko'rsatilmaydi.",
      "Ustalar (INSTALLER) tizimga kirmaydi, ularga login va parol yaratilmaydi.",
      "Mavjud login band bo'lsa — qator o'tkazib yuboriladi (mavjud xodim o'zgarmaydi).",
    ],
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES) as BulkEntityKey[];

export function isBulkEntity(v: string): v is BulkEntityKey {
  return Object.prototype.hasOwnProperty.call(ENTITIES, v);
}

/** Shablon fayl nomi. */
export function templateFileName(key: BulkEntityKey): string {
  return `TP-shablon-${key}.xlsx`;
}

// CSV import maydonlari — klient (mapping UI) va server (action) uchun umumiy.

export const IMPORT_FIELDS = [
  { key: "fullName", label: "FIO", required: true },
  { key: "restaurantName", label: "Restoran nomi", required: true },
  { key: "phone", label: "Telefon", required: true },
  { key: "region", label: "Viloyat", required: false },
  { key: "phoneSecondary", label: "Qo'shimcha telefon", required: false },
  { key: "contractNumber", label: "Shartnoma raqami", required: false },
  { key: "contractDate", label: "Shartnoma sanasi", required: false },
  { key: "installerName", label: "Kim o'rnatgan", required: false },
  { key: "monoblokCount", label: "Monoblok soni", required: false },
  { key: "equipment", label: "Apparat", required: false },
  { key: "monthlyAmount", label: "To'lov miqdori", required: false },
  { key: "currency", label: "Valyuta", required: false },
  { key: "nextPaymentDate", label: "Keyingi to'lov sanasi", required: false },
  { key: "debtAmount", label: "Qarz qoldig'i", required: false },
  { key: "lastPaymentAmount", label: "Oxirgi to'lov summasi", required: false },
  { key: "lastPaymentDate", label: "Oxirgi to'lov sanasi", required: false },
  { key: "equipmentType", label: "O'rnatilgan uskuna turi", required: false },
  { key: "equipmentQty", label: "Uskuna miqdori", required: false },
  { key: "equipmentOwnership", label: "Uskuna egaligi (ijara/sotuv)", required: false },
  { key: "status", label: "Holat", required: false },
  { key: "notes", label: "Izoh", required: false },
  { key: "operator", label: "Operator (TP xodimi)", required: false },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

const FIELD_KEYWORDS: Record<string, string[]> = {
  fullName: ["fio", "f i o", "ism", "mijoz", "имя"],
  restaurantName: ["restoran", "restaurant", "obyekt", "obekt", "zavedenie", "ресторан", "nomi"],
  phone: ["telefon", "tel raqam", "tel", "mobil", "phone", "телефон"],
  region: ["viloyat", "region", "hudud", "область"],
  phoneSecondary: ["qoshimcha telefon", "ikkinchi telefon", "2 tel"],
  contractNumber: ["shartnoma raqam", "shartnoma raqami", "shartnoma no", "dogovor"],
  contractDate: ["shartnoma sana", "shartnoma sanasi", "dogovor sana"],
  installerName: ["kim ornatgan", "ornatgan", "montaj", "ustanov"],
  monoblokCount: ["monoblok", "moноблок", "monoblok soni"],
  equipment: ["apparat", "uskuna", "jihoz", "oborud"],
  monthlyAmount: ["tolov miqdor", "tolov miqdori", "summa", "miqdor", "narx", "сумма", "оплата"],
  currency: ["valyuta", "valuta", "currency"],
  nextPaymentDate: ["keyingi tolov", "tolov kuni", "keyingi tolov sanasi"],
  debtAmount: ["qarz", "qarzdorlik", "qoldiq", "долг", "задолж"],
  lastPaymentAmount: ["oxirgi tolov summa", "tolangan summa", "oxirgi tolov"],
  lastPaymentDate: ["oxirgi tolov sana", "tolangan sana", "tolov sanasi"],
  equipmentType: ["uskuna turi", "ornatilgan uskuna", "texnika turi"],
  equipmentQty: ["uskuna miqdor", "uskuna soni", "texnika soni"],
  equipmentOwnership: ["egalik", "ijara sotuv", "ownership"],
  status: ["holat", "status", "статус"],
  notes: ["izoh", "muammo", "taklif", "comment", "коммент", "примечание"],
  operator: ["tp xodimi", "tp xodim", "operator", "qongiroq xodim", "kim gaplashgan"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/['`’ʻ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sarlavhalardan har bir maydon uchun ustun indeksini taxmin qiladi (-1 = topilmadi). */
export function guessMapping(headers: string[]): Record<string, number> {
  const norm = headers.map((h) => normalize(h));
  const used = new Set<number>();
  const map: Record<string, number> = {};

  for (const f of IMPORT_FIELDS) {
    const kws = (FIELD_KEYWORDS[f.key] ?? []).map((k) => normalize(k));
    let found = -1;
    for (let idx = 0; idx < norm.length; idx++) {
      if (used.has(idx)) continue;
      if (kws.some((kw) => norm[idx].includes(kw))) {
        found = idx;
        break;
      }
    }
    map[f.key] = found;
    if (found >= 0) used.add(found);
  }

  return map;
}

// Yuklangan shablon faylini o'qish va qatorlarni tekshirish.
//
// Sarlavhalar ENTITIES dagi `label` bo'yicha moslanadi — foydalanuvchi
// ustunlarni joyini almashtirsa yoki ortiqcha ustun qo'shsa ham ishlaydi.
// Bu fayldagi hamma narsa SOF (fayl o'qish tashqarida) — testlanadi.

import type { ColumnDef, EntityDef } from "./entities";

/**
 * Sarlavhalarni solishtirish uchun normallashtirish.
 *
 * Shablonda majburiy ustun " *" bilan belgilanadi ("FIO *") — solishtirishda
 * u OLIB TASHLANADI, aks holda fayl qaytib kelganda ustun tanilmay qoladi.
 */
export function normHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʼʻ'`’]/g, "'") // turli apostroflar
    .replace(/\s*\*+\s*$/, "") // majburiylik belgisi
    .replace(/\s+/g, " ")
    .trim();
}

export type HeaderMap = {
  /** ustun kaliti -> fayldagi indeks */
  index: Record<string, number>;
  /** Topilmagan MAJBURIY ustunlar (label). */
  missingRequired: string[];
  /** Umuman tanilmagan ustunlar (label) — e'tiborsiz qoldiriladi. */
  unknown: string[];
};

/** Fayl sarlavhasini ta'rifdagi ustunlarga moslaydi. */
export function mapHeaders(def: EntityDef, header: string[]): HeaderMap {
  const norm = header.map((h) => normHeader(String(h ?? "")));
  const index: Record<string, number> = {};
  const used = new Set<number>();

  for (const col of def.columns) {
    const i = norm.indexOf(normHeader(col.label));
    if (i >= 0) {
      index[col.key] = i;
      used.add(i);
    }
  }

  return {
    index,
    missingRequired: def.columns
      .filter((c) => c.required && index[c.key] === undefined)
      .map((c) => c.label),
    unknown: norm
      .map((h, i) => ({ h, i }))
      .filter((x) => x.h !== "" && !used.has(x.i))
      .map((x) => header[x.i]),
  };
}

export type ParsedRow = {
  /** Fayldagi qator raqami (1-asosli, sarlavha = 1). */
  line: number;
  values: Record<string, string>;
  errors: string[];
};

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // Excel sanani Date qilib qaytaradi — YYYY-MM-DD ga keltiramiz.
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === "number") {
    // Excel sonni float qilib beradi; butun bo'lsa nuqtasiz chiqaramiz.
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
};

/**
 * Xom jadvalni (birinchi qator — sarlavha) ta'rif bo'yicha qatorlarga aylantiradi.
 * Majburiy maydon bo'sh bo'lsa qatorga xato yoziladi (lekin qator tashlanmaydi —
 * foydalanuvchi oldindan ko'rishda nimasi xato ekanini ko'rishi kerak).
 */
export function parseRows(
  def: EntityDef,
  table: unknown[][],
  opts: { skipExampleRow?: boolean } = {},
): { headers: HeaderMap; rows: ParsedRow[] } {
  if (table.length === 0) {
    return {
      headers: { index: {}, missingRequired: def.columns.filter((c) => c.required).map((c) => c.label), unknown: [] },
      rows: [],
    };
  }

  const header = (table[0] ?? []).map((v) => cell(v));
  const headers = mapHeaders(def, header);
  const rows: ParsedRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const raw = table[r] ?? [];
    const values: Record<string, string> = {};
    for (const col of def.columns) {
      const i = headers.index[col.key];
      values[col.key] = i === undefined ? "" : cell(raw[i]);
    }

    // Butunlay bo'sh qator — o'tkazib yuboramiz (Excel oxirida ko'p bo'ladi).
    if (Object.values(values).every((v) => v === "")) continue;

    // Shablondagi namuna qatorini tanib, tashlab yuboramiz.
    if (opts.skipExampleRow !== false && isExampleRow(def, values)) continue;

    const errors: string[] = [];
    for (const col of def.columns) {
      if (col.required && !values[col.key]) errors.push(`"${col.label}" bo'sh`);
    }

    rows.push({ line: r + 1, values, errors });
  }

  return { headers, rows };
}

/** Foydalanuvchi shablondagi namuna qatorini o'chirishni unutgan bo'lsa. */
export function isExampleRow(def: EntityDef, values: Record<string, string>): boolean {
  const filled = def.columns.filter((c) => c.example !== "");
  if (filled.length < 2) return false;
  return filled.every((c) => values[c.key] === c.example);
}

// ---------------------------------------------------------------------------
// Umumiy qiymat tekshiruvlari
// ---------------------------------------------------------------------------

/** "350 000", "350000.50", "1,5" -> son. Yaroqsiz bo'lsa null. */
export function parseAmount(v: string): number | null {
  const t = v.replace(/\s/g, "").replace(/,/g, ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** YYYY-MM-DD (yoki DD.MM.YYYY) -> Date. Yaroqsiz bo'lsa null. */
export function parseDate(v: string): Date | null {
  const t = v.trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Telefon raqamining solishtirish kaliti (oxirgi 9 raqam). */
export function phoneKey(v: string): string {
  return v.replace(/\D/g, "").slice(-9);
}

/** Mijozni topish uchun berilgan ustunlardan kamida bittasi to'ldirilganmi. */
export function hasClientLookup(values: Record<string, string>): boolean {
  return !!(values.clientPhone || values.clientContract || values.clientName);
}

/** Ustun ta'rifini kalit bo'yicha topadi (xato matnlari uchun). */
export function columnLabel(def: EntityDef, key: string): string {
  return def.columns.find((c: ColumnDef) => c.key === key)?.label ?? key;
}

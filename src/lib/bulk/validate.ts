// Qatorlarni bazaga qarab tekshirish va yozishga tayyor yozuvga aylantirish.
//
// Bu yerda DB'dan faqat QIDIRUV ma'lumoti (mijozlar, texnika turlari, mavjud
// loginlar) olinadi va Map ko'rinishida beriladi — shu bois asosiy mantiq
// (`resolve*` funksiyalari) SOF bo'lib qoladi va testlanadi.

import type { ParsedRow } from "./parse";
import { parseAmount, parseDate, phoneKey, hasClientLookup } from "./parse";

/** Qidiruv indekslari — chaqiruvchi bazadan yig'ib beradi. */
export type Lookups = {
  /** telefon kaliti (oxirgi 9 raqam) -> clientId */
  byPhone: Map<string, string>;
  /** shartnoma raqami (kichik harf) -> clientId */
  byContract: Map<string, string>;
  /** restoran nomi (kichik harf) -> clientId | null (null = bir nechta mos keldi) */
  byName: Map<string, string | null>;
  /** texnika turi nomi (kichik harf) -> id */
  equipmentTypes: Map<string, string>;
  /** band loginlar */
  usernames: Set<string>;
  /** mijoz id -> valyuta (to'lovda bo'sh qolsa ishlatiladi) */
  clientCurrency: Map<string, string>;
};

export type RowResult<T> =
  | { status: "ok"; line: number; record: T; note?: string }
  | { status: "error"; line: number; message: string }
  | { status: "skip"; line: number; message: string };

const lc = (s: string) => s.trim().toLowerCase();

/** Mijozni uch ustundan biri bo'yicha topadi. */
export function resolveClient(
  values: Record<string, string>,
  lk: Lookups,
): { ok: true; id: string } | { ok: false; message: string } {
  if (!hasClientLookup(values)) {
    return { ok: false, message: "Mijoz ko'rsatilmagan (telefon/shartnoma/restoran nomi)" };
  }
  if (values.clientContract) {
    const id = lk.byContract.get(lc(values.clientContract));
    if (id) return { ok: true, id };
  }
  if (values.clientPhone) {
    const id = lk.byPhone.get(phoneKey(values.clientPhone));
    if (id) return { ok: true, id };
  }
  if (values.clientName) {
    const hit = lk.byName.get(lc(values.clientName));
    if (hit === null) {
      return { ok: false, message: `"${values.clientName}" nomli bir nechta mijoz bor — telefon yoki shartnoma yozing` };
    }
    if (hit) return { ok: true, id: hit };
  }
  const shown = values.clientContract || values.clientPhone || values.clientName;
  return { ok: false, message: `Mijoz topilmadi: "${shown}"` };
}

// ---------------------------------------------------------------------------
// To'lovlar
// ---------------------------------------------------------------------------

export type PaymentRecord = {
  clientId: string;
  amount: number;
  currency: string;
  paidAt: Date;
  method: string | null;
  note: string | null;
};

const METHODS: Record<string, string> = { karta: "Karta", qr: "QR" };

export function resolvePayment(row: ParsedRow, lk: Lookups): RowResult<PaymentRecord> {
  if (row.errors.length) return { status: "error", line: row.line, message: row.errors.join("; ") };

  const c = resolveClient(row.values, lk);
  if (!c.ok) return { status: "error", line: row.line, message: c.message };

  const amount = parseAmount(row.values.amount);
  if (amount === null) return { status: "error", line: row.line, message: `Summa noto'g'ri: "${row.values.amount}"` };
  if (amount <= 0) return { status: "error", line: row.line, message: "Summa 0 dan katta bo'lishi kerak" };

  const paidAt = parseDate(row.values.paidAt);
  if (!paidAt) return { status: "error", line: row.line, message: `Sana noto'g'ri: "${row.values.paidAt}" (YYYY-MM-DD kutiladi)` };

  const cur = row.values.currency ? row.values.currency.toUpperCase() : "";
  if (cur && cur !== "USD" && cur !== "UZS") {
    return { status: "error", line: row.line, message: `Valyuta noto'g'ri: "${row.values.currency}" (USD yoki UZS)` };
  }

  const rawMethod = lc(row.values.method);
  if (rawMethod && !Object.prototype.hasOwnProperty.call(METHODS, rawMethod)) {
    return { status: "error", line: row.line, message: `To'lov usuli noto'g'ri: "${row.values.method}" (Karta yoki QR)` };
  }

  return {
    status: "ok",
    line: row.line,
    record: {
      clientId: c.id,
      amount,
      currency: cur || lk.clientCurrency.get(c.id) || "USD",
      paidAt,
      method: rawMethod ? METHODS[rawMethod] : null,
      note: row.values.note || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Uskuna
// ---------------------------------------------------------------------------

export type EquipmentRecord = {
  clientId: string;
  equipmentTypeId: string;
  quantity: number;
  ownership: "RENTAL" | "SOLD";
};

const OWNERSHIP: Record<string, "RENTAL" | "SOLD"> = {
  ijara: "RENTAL",
  rental: "RENTAL",
  sotuv: "SOLD",
  sold: "SOLD",
};

export function resolveEquipment(row: ParsedRow, lk: Lookups): RowResult<EquipmentRecord> {
  if (row.errors.length) return { status: "error", line: row.line, message: row.errors.join("; ") };

  const c = resolveClient(row.values, lk);
  if (!c.ok) return { status: "error", line: row.line, message: c.message };

  const typeId = lk.equipmentTypes.get(lc(row.values.equipmentType));
  if (!typeId) {
    return {
      status: "error",
      line: row.line,
      message: `Texnika turi topilmadi: "${row.values.equipmentType}" — Ombor bo'limidagi nom bilan bir xil bo'lsin`,
    };
  }

  const qty = parseAmount(row.values.quantity);
  if (qty === null || !Number.isInteger(qty) || qty < 0) {
    return { status: "error", line: row.line, message: `Soni noto'g'ri: "${row.values.quantity}" (0 yoki musbat butun son)` };
  }

  const rawOwn = lc(row.values.ownership);
  if (rawOwn && !Object.prototype.hasOwnProperty.call(OWNERSHIP, rawOwn)) {
    return { status: "error", line: row.line, message: `Egaligi noto'g'ri: "${row.values.ownership}" (ijara yoki sotuv)` };
  }

  return {
    status: "ok",
    line: row.line,
    record: {
      clientId: c.id,
      equipmentTypeId: typeId,
      quantity: qty,
      ownership: rawOwn ? OWNERSHIP[rawOwn] : "RENTAL",
    },
    note: qty === 0 ? "0 — mavjud yozuv o'chiriladi" : undefined,
  };
}

// ---------------------------------------------------------------------------
// Xodimlar
// ---------------------------------------------------------------------------

export type StaffRecord = {
  name: string;
  username: string | null;
  role: "ADMIN" | "MANAGER" | "OPERATOR" | "INSTALLER";
  phone: string | null;
  regions: string[];
  shift: "DAY" | "NIGHT";
  /** Shablondagi "Kunlik lid rejasi"; bo'sh — AVTOMATIK (null). */
  dailyLeadTarget: number | null;
};

const ROLES = ["ADMIN", "MANAGER", "OPERATOR", "INSTALLER"] as const;
const ROLE_ALIASES: Record<string, StaffRecord["role"]> = {
  admin: "ADMIN",
  manager: "MANAGER",
  menejer: "MANAGER",
  boshliq: "MANAGER",
  operator: "OPERATOR",
  installer: "INSTALLER",
  usta: "INSTALLER",
};

export function resolveStaff(row: ParsedRow, lk: Lookups, seen: Set<string>): RowResult<StaffRecord> {
  if (row.errors.length) return { status: "error", line: row.line, message: row.errors.join("; ") };

  const role = ROLE_ALIASES[lc(row.values.role)];
  if (!role) {
    return {
      status: "error",
      line: row.line,
      message: `Rol noto'g'ri: "${row.values.role}" (${ROLES.join(", ")} yoki "usta")`,
    };
  }

  const name = row.values.name.trim();
  // Ustalar tizimga kirmaydi — ularga login kerak emas.
  let username: string | null = null;
  if (role !== "INSTALLER") {
    username = lc(row.values.username);
    if (!username) {
      return { status: "error", line: row.line, message: "Login kerak (usta bo'lmagan xodim uchun)" };
    }
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      return {
        status: "error",
        line: row.line,
        message: `Login noto'g'ri: "${row.values.username}" — kamida 3 ta lotin harfi/raqam`,
      };
    }
    if (lk.usernames.has(username)) {
      return { status: "skip", line: row.line, message: `Login band: "${username}" — o'tkazib yuborildi` };
    }
    if (seen.has(username)) {
      return { status: "skip", line: row.line, message: `Login faylda takrorlangan: "${username}"` };
    }
    seen.add(username);
  }

  const target = parseAmount(row.values.dailyLeadTarget);
  const shiftRaw = row.values.shift.toUpperCase();

  return {
    status: "ok",
    line: row.line,
    record: {
      name,
      username,
      role,
      phone: row.values.phone.trim() || null,
      regions: row.values.regions
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
      shift: shiftRaw === "NIGHT" ? "NIGHT" : "DAY",
      dailyLeadTarget: target !== null && target >= 0 ? Math.round(target) : null,
    },
  };
}

/** Xodimlar uchun tasodifiy parol — o'qish oson, taxmin qilish qiyin. */
export function generatePassword(random: () => number = Math.random): string {
  // Chalkashadigan belgilar (0/O, 1/l/I) qasddan yo'q.
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(random() * alphabet.length)];
  }
  return out;
}

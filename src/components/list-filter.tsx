"use client";

// Ro'yxat bo'limlari uchun umumiy filtr elementlari: qidiruv + viloyat tanlash.
// Har bir bo'lim o'z holatini boshqaradi — bu yerda faqat UI va moslash yordamchilari.
import { Search, X } from "lucide-react";

/** Qidiruv uchun normalizatsiya (apostrof/registr/bo'sh joy). */
export function normText(s: string): string {
  return s.toLowerCase().replace(/['`‘’ʻʼ]/g, "").replace(/\s+/g, " ").trim();
}

/** Faqat raqamlar (telefon bo'yicha qidiruv uchun). */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Nom/telefon bo'yicha moslikni tekshiradi (kamida 3 raqam bo'lsa telefon ham). */
export function matchesQuery(query: string, names: string, phone: string | null): boolean {
  const q = normText(query);
  if (!q) return true;
  const qDigits = digitsOnly(query);
  const phoneMatch =
    qDigits.length >= 3 && phone !== null && digitsOnly(phone).includes(qDigits);
  return normText(names).includes(q) || phoneMatch;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Restoran, ism yoki telefon bo'yicha qidiring...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-primary-900/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Tozalash"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function RegionSelect({
  value,
  onChange,
  regions,
  allLabel = "Barcha viloyatlar",
}: {
  value: string;
  onChange: (v: string) => void;
  regions: string[];
  allLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      <option value="">{allLabel}</option>
      {regions.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

/** Ro'yxatdagi viloyatlarning unikal, saralangan ro'yxati. */
export function uniqueRegions(items: { region: string | null }[]): string[] {
  return [...new Set(items.map((i) => i.region).filter((r): r is string => !!r))].sort();
}

/** "Topildi: N / M" ko'rsatkichi. */
export function FoundCount({ found, total }: { found: number; total: number }) {
  return (
    <span className="text-sm text-slate-500 dark:text-slate-400">
      Topildi:{" "}
      <span className="font-semibold text-slate-700 dark:text-slate-200">{found}</span>
      {found !== total && <> / {total}</>}
    </span>
  );
}

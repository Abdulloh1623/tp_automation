// CSV import uchun toza (pure) qiymat parse funksiyalari.
// Server action'dan ajratilgan — alohida testlanadi va qayta ishlatiladi.

export function opt(v?: string): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

// Ming/o'nlik ajratuvchilarni mantiqiy aniqlab raqamga aylantiradi.
// "1.500.000"->1500000, "1.500"->1500, "1,5"->1.5, "52.50"->52.5, "450 000"->450000
export function num(v?: string): number | undefined {
  if (v == null) return undefined;
  let s = v.replace(/[^\d.,-]/g, "");
  if (s === "" || s === "-") return undefined;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    const decSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thouSep = decSep === "." ? "," : ".";
    s = s.split(thouSep).join("");
    if (decSep === ",") s = s.replace(",", ".");
  } else if (hasComma) {
    const parts = s.split(",");
    const last = parts[parts.length - 1];
    if (parts.length > 1 && last.length === 3 && parts[0].length > 0) {
      s = parts.join(""); // minglik: 1,500
    } else {
      s = parts.slice(0, -1).join("") + "." + last; // o'nlik: 1,5
    }
  } else if (hasDot) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || (last.length === 3 && parts[0].length > 0)) {
      s = parts.join(""); // minglik: 1.500.000 yoki 1.500
    }
    // aks holda o'nlik (1.5, 52.50) — o'zgartirmaymiz
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function makeDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d, 12, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null; // chegaradan tashqari (masalan 31.02) — rad etiladi
  }
  return date;
}

export function parseDate(v?: string): Date | null {
  const t = (v ?? "").trim();
  if (!t) return null;

  let m = t.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return makeDate(year, Number(m[2]), Number(m[1]));
  }

  m = t.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if (m) {
    return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  const generic = new Date(t);
  return Number.isNaN(generic.getTime()) ? null : generic;
}

export function normCurrency(v: string | undefined, fallback: string): string {
  const t = (v ?? "").toLowerCase();
  if (
    t.includes("so") ||
    t.includes("uzs") ||
    t.includes("сум") ||
    t.includes("сўм")
  ) {
    return "UZS";
  }
  if (t.includes("usd") || t.includes("dollar") || t.includes("$")) {
    return "USD";
  }
  return fallback === "UZS" ? "UZS" : "USD";
}

export function normStatus(v?: string): string {
  const t = (v ?? "").toLowerCase();
  if (
    t.includes("o'chir") ||
    t.includes("ochiril") ||
    t.includes("inactive") ||
    t.includes("отключ")
  ) {
    return "INACTIVE";
  }
  if (t.includes("kutil") || t.includes("pending") || t.includes("ожид")) {
    return "PENDING";
  }
  return "ACTIVE";
}

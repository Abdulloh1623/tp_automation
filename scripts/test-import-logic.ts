// Import parsing logikasining birlik testi (tsx bilan ishga tushiriladi).
import { num, parseDate, normCurrency, normStatus } from "../src/lib/import-parse";
import { parseCsvWithHeader } from "../src/lib/csv";
import { guessMapping } from "../src/lib/import-fields";
import { normalizePhone } from "../src/lib/utils";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, exp: unknown) {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g === e) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${name}: got ${g}, expected ${e}`);
  }
}
function dateStr(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- num() ---
eq("num 1.500.000", num("1.500.000"), 1500000);
eq("num 1.500", num("1.500"), 1500);
eq("num 1,5", num("1,5"), 1.5);
eq("num 52.50", num("52.50"), 52.5);
eq("num 450 000", num("450 000"), 450000);
eq("num 62$", num("62$"), 62);
eq("num 1,500", num("1,500"), 1500);
eq("num 12 500,50", num("12 500,50"), 12500.5);
eq("num empty", num(""), undefined);
eq("num abc", num("abc"), undefined);

// --- parseDate() ---
eq("date 31.02.2024 invalid", dateStr(parseDate("31.02.2024")), null);
eq("date 13.13.2024 invalid", dateStr(parseDate("13.13.2024")), null);
eq("date 15.03.2025", dateStr(parseDate("15.03.2025")), "2025-03-15");
eq("date 2025-06-01", dateStr(parseDate("2025-06-01")), "2025-06-01");
eq("date leap 29.02.2024", dateStr(parseDate("29.02.2024")), "2024-02-29");
eq("date non-leap 29.02.2023", dateStr(parseDate("29.02.2023")), null);
eq("date empty", dateStr(parseDate("")), null);

// --- normCurrency() ---
eq("cur empty->UZS fallback", normCurrency("", "UZS"), "UZS");
eq("cur empty->USD fallback", normCurrency("", "USD"), "USD");
eq("cur so'm", normCurrency("so'm", "USD"), "UZS");
eq("cur USD over UZS fallback", normCurrency("USD", "UZS"), "USD");

// --- normStatus() ---
eq("status ochirilgan", normStatus("O'chirilgan"), "INACTIVE");
eq("status kutilmoqda", normStatus("Kutilmoqda"), "PENDING");
eq("status faol", normStatus("Faol"), "ACTIVE");
eq("status empty->ACTIVE", normStatus(""), "ACTIVE");

// --- normalizePhone() ---
eq(
  "phone normalize equal",
  normalizePhone("+998 99 111 22 33") === normalizePhone("998 99 111 22 33"),
  true,
);

// --- guessMapping(): phone 'raqam' ochko'zligi tuzatilgani ---
const map1 = guessMapping(["FIO", "Restoran nomi", "Telefon", "Shartnoma raqami", "Valyuta"]);
eq("guess phone->Telefon(2)", map1.phone, 2);
eq("guess contractNumber->Shartnoma(3)", map1.contractNumber, 3);

const map2 = guessMapping(["FIO", "Restoran nomi", "Shartnoma raqami", "Mobil raqam"]);
eq("guess2 phone->Mobil(3)", map2.phone, 3);
eq("guess2 contractNumber->Shartnoma(2)", map2.contractNumber, 2);

// --- parseCsvWithHeader(): satr raqamlari ---
const csv =
  "FIO,Restoran,Telefon\nA,RA,111\n\nB,RB,222\nC,RC,333";
const parsed = parseCsvWithHeader(csv);
eq("csv headers", parsed.headers, ["FIO", "Restoran", "Telefon"]);
eq("csv row count", parsed.rows.length, 3);
// A=fizik 2-satr, B=4-satr (3-satr bo'sh), C=5-satr
eq("csv lines (header+blank hisobga olingan)", parsed.lines, [2, 4, 5]);

// quoted field with comma + newline
const csv2 = 'a,b\n"x,y","line1\nline2"';
const p2 = parseCsvWithHeader(csv2);
eq("csv quoted cells", p2.rows[0], ["x,y", "line1\nline2"]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;

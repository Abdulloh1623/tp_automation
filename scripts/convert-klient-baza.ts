/**
 * "Klient baza" xlsx faylini /malumotlar ommaviy yuklash shabloniga aylantiradi.
 *
 * NEGA: xom sheet sarlavhalari shablonga mos emas (1-ustun sarlavhasi umuman
 * xodim ismi — "umarali"), shuning uchun faylni to'g'ridan-to'g'ri yuklab
 * bo'lmaydi. Ikki varaqning ustun tartibi ham HAR XIL.
 *
 * Ustun xaritasi (0-indeks):
 *   Sheet1 (faol):  0 FIO · 1 shartnoma sanasi · 2 to'lov miqdori ·
 *                   3 "yangi to'lov" · 6 usta · 7 telefon · 8 shartnoma № ·
 *                   10 "sotib olingan" · 11 izoh · 12 monoblok soni
 *   Atkazlar:       0 FIO · 1 shartnoma sanasi · 2 to'lov miqdori ·
 *                   3 usta · 4 telefon · 5 shartnoma № · 6 "sotib olingan" ·
 *                   7 izoh · 8 monoblok soni
 *
 * Natija: ikkita CSV — faol varaq (Holat=ACTIVE) va otkazlar (Holat=INACTIVE).
 * Ularni /malumotlar → "Mijozlar" yuklash oynasiga tashlash kerak. U yerdagi
 * import `mode: "create"` — telefoni bazada bor mijoz O'TKAZIB YUBORILADI,
 * ustiga yozilmaydi. Ya'ni "faqat yangilari" qoidasi haqiqiy bazaga qarshi
 * ishlaydi (bu skript bazani umuman bilmasligi kerak emas).
 *
 * Ishlatish:
 *   npx tsx scripts/convert-klient-baza.ts "<xlsx>" [chiqish-katalogi] [--eski-narx]
 *
 * `--eski-narx` — Sheet1 da "Yangi to'lov" o'rniga shartnomadagi
 * "TOLOV MIQDORI" ustunini oladi.
 */
import { writeFileSync } from "fs";
import path from "path";
import readXlsxFile from "read-excel-file/node";
import { computeNextPaymentDate } from "../src/lib/billing";

type SheetMap = {
  /** Varaq nomi fayldagidek (topilmasa indeks bo'yicha olinadi). */
  name: string;
  fio: number;
  contractDate: number;
  amount: number;
  /** Sheet1 dagi "Yangi to'lov" — boshqa varaqda yo'q. */
  newAmount?: number;
  usta: number;
  phone: number;
  contract: number;
  sold: number;
  desc: number;
  monoblok: number;
  status: "ACTIVE" | "INACTIVE";
  out: string;
};

const MAPS: SheetMap[] = [
  {
    name: "Sheet1",
    fio: 0, contractDate: 1, amount: 2, newAmount: 3, usta: 6,
    phone: 7, contract: 8, sold: 10, desc: 11, monoblok: 12,
    status: "ACTIVE",
    out: "klient-baza-faol.csv",
  },
  {
    name: "Atkazlar va Ishlatmayotganlar",
    fio: 0, contractDate: 1, amount: 2, usta: 3,
    phone: 4, contract: 5, sold: 6, desc: 7, monoblok: 8,
    status: "INACTIVE",
    out: "klient-baza-otkaz.csv",
  },
];

const HEADER = [
  "FIO", "Restoran nomi", "Telefon", "Qo'shimcha telefon", "Shartnoma raqami",
  "Shartnoma sanasi", "Kim o'rnatgan", "Monoblok soni", "To'lov miqdori",
  "Valyuta", "Keyingi to'lov sanasi", "Holat", "Izoh",
];

const cell = (r: unknown[], i: number | undefined): string =>
  i === undefined ? "" : String(r?.[i] ?? "").trim();

/**
 * Bitta raqamni +998XXXXXXXXX ko'rinishiga keltiradi.
 *
 * DIQQAT — uzunlik AVVAL tekshiriladi: "99 812 48 58" (operator prefiksi 99)
 * raqamlarda "998124858" bo'lib chiqadi va sodda "998 bilan boshlansa mamlakat
 * kodi" qoidasi uni +998124858 deb kesib tashlaydi. Natijada 99-prefiksli
 * mijozlar "yaroqsiz telefon" deb import chetida qolib ketardi.
 */
function canonOne(raw: string): string {
  let d = raw.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.length === 9) return "+998" + d; // lokal raqam (prefiks + 7 raqam)
  if (d.length === 10 && d.startsWith("8")) return "+998" + d.slice(1); // eski 8-prefiks
  if (d.length === 11 && d.startsWith("8")) d = "998" + d.slice(1);
  if (d.length >= 12 && d.startsWith("998")) return "+" + d.slice(0, 12);
  if (d.length > 9) return "+998" + d.slice(-9); // ortiqcha raqamlar — oxirgi 9 tasi
  return "+" + d;
}

/** Katakdagi barcha raqamlar (vergul/slash bilan ajratilgan). */
function allPhones(raw: string): string[] {
  return raw
    .split(/[,/|;\n]+/)
    .map((p) => canonOne(p))
    .filter(Boolean);
}

/**
 * Birlamchi raqam — YAROQLI bo'lganlarning birinchisi. Ba'zi mijozlarda
 * birinchi raqam shahar/eskirgan (masalan 70-prefiks), ikkinchisi esa ishlaydi;
 * ilgari faqat birinchisi olinar va butun qator tashlab yuborilardi.
 */
function canonPhone(raw: string): string {
  const list = allPhones(raw);
  return list.find(validUzPhone) ?? list[0] ?? "";
}
function extraPhone(raw: string): string {
  const primary = canonPhone(raw);
  return allPhones(raw).find((p) => p !== primary && validUzPhone(p)) ?? "";
}
function validUzPhone(p: string): boolean {
  return /^\+998(20|33|50|55|77|88|90|91|93|94|95|97|98|99)\d{7}$/.test(p);
}
/** "29.07.2025" (yoki Excel sanasi) → Date */
function parseDate(raw: string): Date | null {
  const m = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 9, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(raw);
  return raw && !isNaN(iso.getTime()) ? iso : null;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function cleanContract(raw: string): string {
  const m = raw.match(/AB\s*\d[\d.]*/i);
  return m ? m[0].replace(/\s+/g, "") : "";
}
function money(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}
/** Excel "1.0" ni 1 qiladi (xlsx sonlarni float qilib beradi). */
function intOf(raw: string): number {
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
/** Ism qavsidagi joy nomi restoran nomiga tushadi; bo'lmasa ismning o'zi. */
function nameAndVenue(raw: string): { name: string; venue: string } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), venue: m[2].trim() };
  return { name: raw.trim(), venue: raw.trim() };
}
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

type Row = { out: string[]; phone: string; amountDiff?: string };

function convert(map: SheetMap, rows: unknown[][], useOldPrice: boolean) {
  const out: Row[] = [];
  const invalid: string[] = [];
  const noDate: string[] = [];
  const dupInFile: string[] = [];
  const amountDiffs: string[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const rawName = cell(r, map.fio);
    if (!rawName || rawName.toLowerCase() === "umarali") continue;

    const contractDate = parseDate(cell(r, map.contractDate));
    if (!contractDate) {
      noDate.push(rawName);
      continue;
    }

    const phone = canonPhone(cell(r, map.phone));
    if (!validUzPhone(phone)) {
      invalid.push(`${rawName} (${cell(r, map.phone) || "telefonsiz"})`);
      continue;
    }
    if (seen.has(phone)) {
      dupInFile.push(`${rawName} (${phone})`);
      continue;
    }
    seen.add(phone);

    const { name, venue } = nameAndVenue(rawName);
    const base = money(cell(r, map.amount));
    const updated = map.newAmount !== undefined ? money(cell(r, map.newAmount)) : 0;
    // Sheet1 da ikkita narx ustuni bor: "TOLOV MIQDORI" (shartnomadagi) va
    // "Yangi to'lov" (qayta kelishilgan). Yangi mijoz uchun joriy narx —
    // ikkinchisi, shuning uchun u to'ldirilgan bo'lsa o'sha olinadi.
    // `--eski-narx` bilan shartnomadagi summaga qaytish mumkin.
    const amount = !useOldPrice && updated > 0 ? updated : base;
    if (updated > 0 && base > 0 && updated !== base) {
      amountDiffs.push(`${name}: ${base}$ → ${updated}$`);
    }

    out.push({
      phone,
      out: [
        name,
        venue,
        phone,
        extraPhone(cell(r, map.phone)),
        cleanContract(cell(r, map.contract)),
        ymd(contractDate),
        cell(r, map.usta),
        String(intOf(cell(r, map.monoblok))),
        String(amount),
        "USD",
        ymd(computeNextPaymentDate(contractDate)),
        map.status,
        cell(r, map.desc),
      ],
    });
  }

  return { out, invalid, noDate, dupInFile, amountDiffs };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const useOldPrice = process.argv.includes("--eski-narx");
  const src = args[0];
  const outDir = args[1] ?? path.dirname(src ?? ".");
  if (!src) {
    console.error('Ishlatish: npx tsx scripts/convert-klient-baza.ts "<xlsx>" [chiqish-katalogi]');
    process.exit(1);
  }

  // `getSheets` read-excel-file tiplarida e'lon qilinmagan, lekin runtime'da
  // varaq nomi + ma'lumotini birga qaytaradi — bizga ikkalasi ham kerak.
  const sheets = (await (readXlsxFile as unknown as (
    p: string,
    o: { getSheets: true },
  ) => Promise<{ sheet: string; data: unknown[][] }[]>)(src, { getSheets: true }));

  for (const map of MAPS) {
    const found = sheets.find((s) => s.sheet === map.name) ?? sheets[MAPS.indexOf(map)];
    if (!found) {
      console.log(`\n!! "${map.name}" varag'i topilmadi — o'tkazib yuborildi`);
      continue;
    }
    const res = convert(map, found.data, useOldPrice);
    const file = path.join(outDir, map.out);
    const csv = [HEADER, ...res.out.map((r) => r.out)]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    writeFileSync(file, "﻿" + csv, "utf8");

    console.log(`\n=== ${found.sheet} → ${map.out} (Holat=${map.status}) ===`);
    console.log(`  yozildi: ${res.out.length}`);
    if (res.invalid.length) console.log(`  yaroqsiz telefon (tashlandi): ${res.invalid.length}`);
    if (res.noDate.length) console.log(`  shartnoma sanasi yo'q (tashlandi): ${res.noDate.length}`);
    if (res.dupInFile.length) console.log(`  fayl ichida takror (tashlandi): ${res.dupInFile.length}`);
    if (res.amountDiffs.length) {
      console.log(
        `  narxi o'zgargan (${useOldPrice ? "SHARTNOMADAGI summa olindi" : "\"Yangi to'lov\" olindi"}): ${res.amountDiffs.length}`,
      );
      res.amountDiffs.slice(0, 10).forEach((d) => console.log(`     ${d}`));
      if (res.amountDiffs.length > 10) console.log(`     … va yana ${res.amountDiffs.length - 10} ta`);
    }
    if (res.invalid.length) {
      console.log(`  --- yaroqsiz telefonlar ---`);
      res.invalid.slice(0, 15).forEach((x) => console.log(`     ${x}`));
      if (res.invalid.length > 15) console.log(`     … va yana ${res.invalid.length - 15} ta`);
    }
    console.log(`  fayl: ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

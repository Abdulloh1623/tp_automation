/**
 * "Klient baza" xlsx faylidan mijozlardagi IJARA uskunasini ajratib oladi va
 * /malumotlar → "Uskuna (ijara/sotuv)" ommaviy yuklash faylini yasaydi.
 *
 * NEGA ALOHIDA SKRIPT: sheet'da uskuna soni bor, lekin egaligi (ijara/sotuv)
 * hech qayerda maydon sifatida yozilmagan — u ikki joydan chiqariladi:
 *   1. "Sotib olingan" ustuni (erkin matn),
 *   2. mijoz "Atkazlar va Ishlatmayotganlar" varag'ida turibdimi.
 * Ikkalasini ham qo'lda ajratib o'tirmaslik uchun qoida shu yerda kodlangan.
 *
 * QOIDA (ijara deb hisoblanadi):
 *   - mijoz Atkazlar varag'ida BO'LMASA, va
 *   - shu turdagi uskuna "sotib olingan" deb belgilanmagan bo'lsa.
 * Atkazlar varag'idagi mijozlarning texnikasi umuman hisobga olinmaydi —
 * ular tizimda otkaz, uskunasi qaytarilishi kerak bo'lgan qoldiq.
 *
 * Ustun xaritasi (0-indeks) — `convert-klient-baza.ts` dagi bilan bir xil manba:
 *   Sheet1:   0 FIO · 2 to'lov · 3 "yangi to'lov" · 7 telefon · 8 shartnoma № ·
 *             10 "sotib olingan" · 11 izoh · 12 monoblok · 14 printer · 16 router
 *   Atkazlar: 0 FIO
 *
 * Ishlatish:
 *   npx tsx scripts/klient-baza-uskuna.ts "<xlsx>" [chiqish-katalogi]
 */
import { writeFileSync } from "fs";
import path from "path";
import readXlsxFile from "read-excel-file/node";

/** Omborda (EquipmentType) turgan nom bilan AYNAN bir xil bo'lishi shart. */
const TYPE_MONOBLOK = "Monoblok";
const TYPE_PRINTER = "Printer";
const TYPE_ROUTER = "Router";

const COL = {
  fio: 0,
  amount: 2,
  newAmount: 3,
  phone: 7,
  contract: 8,
  sold: 10,
  desc: 11,
  monoblok: 12,
  printer: 14,
  router: 16,
} as const;

const ATKAZ_COL = { fio: 0 } as const;

/**
 * "Sotib olingan" ustunida hammasi sotib olinganini bildiruvchi matnlar.
 * Bu ro'yxatga TUSHMAGAN va bo'sh ham bo'lmagan har qanday qiymat —
 * aralash holat: pastdagi `MIXED` jadvalidan qidiriladi, topilmasa ogohlantirish
 * chiqadi va qator ehtiyot yuzasidan TASHLANADI (noto'g'ri ijara yozishdan
 * ko'ra tushib qolgani yaxshi).
 */
const FULLY_SOLD = /^sotib\s+ol(gan|ingan|di)\b/i;

/**
 * Aralash holatlar — shartnoma raqami bo'yicha. Har birida sheetdagi matn
 * izoh sifatida turibdi; sonlar SOTIB OLINGAN miqdor (ijaradan ayiriladi).
 */
const MIXED: Record<string, { monoblok?: number; printer?: number; router?: number; note: string }> = {
  // "1 ta monoblok arenda / 2 ta printer sotib olgan" — Fayzullayev Asadbek
  AB260126: { printer: 2, note: "1 monoblok ijara, 2 printer sotib olgan" },
  // "3ta Printerni sotib olgan" — Begmurodov Asomiddin
  AB220526: { printer: 3, note: "3 printer sotib olgan, monoblok ijarada" },
  // "5ta Printer Sotib oldi" — Qudratov Talg'at (sheetda printer soni allaqachon 0)
  AB240526269: { printer: 5, note: "5 printer sotib olgan, monoblok ijarada" },
};

/**
 * "Sotib olingan" ustuni bo'sh, lekin izohda sotuv aytilgan qatorlar.
 * Bittasi bor: "Mono Arenda 2 ta Printer sotib olgan srazu".
 */
const MIXED_BY_DESC = /\barenda\b|\bijara\b/i;

const cell = (r: unknown[], i: number): string => String(r?.[i] ?? "").trim();
const intOf = (v: string): number => {
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};
const money = (v: string): number => {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
};
const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const contractKey = (s: string) =>
  (s.match(/AB\s*\d[\d.]*/i)?.[0] ?? "").replace(/\s+/g, "").toUpperCase();

/** Bitta raqamni +998XXXXXXXXX ko'rinishiga keltiradi (konvertor bilan bir xil). */
function canonOne(raw: string): string {
  let d = raw.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.length === 9) return "+998" + d;
  if (d.length === 10 && d.startsWith("8")) return "+998" + d.slice(1);
  if (d.length === 11 && d.startsWith("8")) d = "998" + d.slice(1);
  if (d.length >= 12 && d.startsWith("998")) return "+" + d.slice(0, 12);
  if (d.length > 9) return "+998" + d.slice(-9);
  return "+" + d;
}
const validUzPhone = (p: string) =>
  /^\+998(20|33|50|55|77|88|90|91|93|94|95|97|98|99)\d{7}$/.test(p);
function canonPhone(raw: string): string {
  const list = raw.split(/[,/|;\n]+/).map(canonOne).filter(Boolean);
  return list.find(validUzPhone) ?? list[0] ?? "";
}
/** Ism qavsidagi joy nomi restoran nomi bo'lib import qilingan. */
function venueOf(raw: string): string {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return (m ? m[2] : raw).trim();
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * "Shartnoma raqami" ATAYLAB YO'Q. `resolveClient` avval shartnoma bo'yicha
 * qidiradi, sheetda esa 12 ta raqam bir necha mijozda takrorlangan — uskuna
 * boshqa mijozga yozilib ketardi. Telefon esa mijozlar importida ham kalit
 * bo'lgan, shuning uchun ishonchli.
 */
const HEADER = ["Mijoz telefoni", "Restoran nomi", "Texnika turi", "Soni", "Egaligi"];

type Totals = { clients: number; monoblok: number; printer: number; router: number };
const zero = (): Totals => ({ clients: 0, monoblok: 0, printer: 0, router: 0 });
/**
 * `countClient=false` — aralash mijoz (bir qismi ijara, bir qismi sotuv):
 * uskunasi ikkala hisobga tushadi, lekin mijoz ikki marta sanalmasin.
 */
const addTo = (t: Totals, m: number, p: number, r: number, countClient = true) => {
  if (countClient) t.clients++;
  t.monoblok += m;
  t.printer += p;
  t.router += r;
};
const line = (t: Totals) =>
  `mijoz ${t.clients} · monoblok ${t.monoblok} · printer ${t.printer} · router ${t.router} · JAMI ${
    t.monoblok + t.printer + t.router
  }`;

async function main() {
  const src = process.argv[2];
  const outDir = process.argv[3] ?? path.dirname(src ?? ".");
  if (!src) {
    console.error('Ishlatish: npx tsx scripts/klient-baza-uskuna.ts "<xlsx>" [chiqish-katalogi]');
    process.exit(1);
  }

  const sheets = await (readXlsxFile as unknown as (
    p: string,
    o: { getSheets: true },
  ) => Promise<{ sheet: string; data: unknown[][] }[]>)(src, { getSheets: true });

  const main1 = sheets.find((s) => s.sheet === "Sheet1") ?? sheets[0];
  const atkazSheet =
    sheets.find((s) => /atkaz/i.test(s.sheet)) ?? sheets[1];
  if (!main1 || !atkazSheet) throw new Error("Kerakli varaqlar topilmadi");

  // --- Otkazlar ro'yxati ---
  //
  // FAQAT ISM bo'yicha solishtiriladi. Shartnoma raqami bo'yicha ham qidirish
  // xato beradi: sheetda 12 ta shartnoma raqami ikki-uch mijozda TAKRORLANADI
  // (masalan AB190426 uch xil Jizzax mijozida), shuning uchun raqam bo'yicha
  // moslashtirish faol mijozlarni ham otkazga chiqarib yuborardi.
  // Tekshirildi: Atkazlar varag'idagi 101 ta ismning HAMMASI Sheet1 da bor,
  // ya'ni ism bo'yicha moslashtirish hech kimni o'tkazib yubormaydi.
  const atkazNames = new Set<string>();
  for (const r of atkazSheet.data.slice(3)) {
    const n = cell(r, ATKAZ_COL.fio);
    if (n) atkazNames.add(nameKey(n));
  }

  const rent = zero();
  const sold = zero();
  const atkaz = zero();
  /** Telefon bo'yicha yig'iladi — pastdagi izohga qarang. */
  const byPhone = new Map<
    string,
    { venue: string; monoblok: number; printer: number; router: number; names: string[] }
  >();
  const warnUnknownSold: string[] = [];
  const warnNoLookup: string[] = [];
  const warnCheap: string[] = [];
  const warnDupRow: string[] = [];
  const mixedUsed = new Set<string>();
  const seenNames = new Set<string>();
  let noEquip = 0;

  for (let i = 3; i < main1.data.length; i++) {
    const r = main1.data[i];
    const rawName = cell(r, COL.fio);
    if (!rawName || nameKey(rawName) === "umarali") continue;

    const contract = contractKey(cell(r, COL.contract));
    const isAtkaz = atkazNames.has(nameKey(rawName));

    // Sheetda bitta mijoz ikki marta yozilgan (Shermatova Hafiza) — ikkinchi
    // nusxa hech qayerga qo'shilmasin, aks holda uskunasi ikkilanadi.
    if (seenNames.has(nameKey(rawName))) {
      warnDupRow.push(rawName);
      continue;
    }
    seenNames.add(nameKey(rawName));

    let m = intOf(cell(r, COL.monoblok));
    let p = intOf(cell(r, COL.printer));
    let rt = intOf(cell(r, COL.router));

    // 1) Otkaz — texnikasi umuman hisobga olinmaydi.
    if (isAtkaz) {
      addTo(atkaz, m, p, rt);
      continue;
    }

    // 2) Sotib olinganmi?
    const soldText = cell(r, COL.sold);
    const desc = cell(r, COL.desc);
    // MIXED faqat "Sotib olingan" ustuni to'ldirilgan qatorga tegishli —
    // shartnoma raqami boshqa qatorda takrorlansa unga ta'sir qilmasin.
    const mix = soldText ? MIXED[contract] : undefined;

    if (mix) {
      mixedUsed.add(contract);
      const sm = mix.monoblok ?? 0, sp = mix.printer ?? 0, sr = mix.router ?? 0;
      addTo(sold, sm, sp, sr, false);
      m = Math.max(0, m - sm);
      p = Math.max(0, p - sp);
      rt = Math.max(0, rt - sr);
    } else if (soldText) {
      if (!FULLY_SOLD.test(soldText)) {
        warnUnknownSold.push(`${rawName} — "${soldText}" (${contract || "shartnomasiz"})`);
        continue;
      }
      addTo(sold, m, p, rt);
      continue;
    } else if (MIXED_BY_DESC.test(desc) && /sotib/i.test(desc)) {
      // "Mono Arenda 2 ta Printer sotib olgan" — monoblok ijarada, printer sotuvda.
      addTo(sold, 0, p, 0, false);
      p = 0;
    }

    if (m + p + rt === 0) {
      noEquip++;
      continue;
    }

    const phone = canonPhone(cell(r, COL.phone));
    const venue = venueOf(rawName);
    if (!validUzPhone(phone)) {
      warnNoLookup.push(
        `${rawName} — telefon "${cell(r, COL.phone) || "yo'q"}" · M${m} P${p} R${rt}`,
      );
      continue;
    }

    addTo(rent, m, p, rt);

    // Biznes qoidasi: oyligi 29$ bo'lgan mijozda ijara uskunasi bo'lmasligi kerak.
    const amount = money(cell(r, COL.newAmount)) || money(cell(r, COL.amount));
    if (amount > 0 && amount <= 29) {
      warnCheap.push(`${rawName} — ${amount}$ · M${m} P${p} R${rt}`);
    }

    // Telefon bo'yicha YIG'AMIZ. Sababi: sheetda ikki xil mijoz (filial) bir
    // telefonni ulashadi, bazada esa telefon — yagona kalit. Import miqdorni
    // TENGLASHTIRADI (ustiga qo'shmaydi), ya'ni ikkita alohida qator yozilsa
    // ikkinchisi birinchisini o'chirib yuborardi. Qo'shib yuborish jamini
    // saqlaydi; ulashilgan telefonlar pastda ogohlantirish bo'lib chiqadi.
    const acc = byPhone.get(phone) ?? {
      venue,
      monoblok: 0,
      printer: 0,
      router: 0,
      names: [] as string[],
    };
    acc.monoblok += m;
    acc.printer += p;
    acc.router += rt;
    acc.names.push(rawName);
    byPhone.set(phone, acc);
  }

  const rows: string[][] = [];
  const warnSharedPhone: string[] = [];
  for (const [phone, a] of byPhone) {
    if (a.names.length > 1) {
      warnSharedPhone.push(`${phone} — ${a.names.join(" || ")}`);
    }
    const lookup = [phone, a.venue];
    if (a.monoblok > 0) rows.push([...lookup, TYPE_MONOBLOK, String(a.monoblok), "ijara"]);
    if (a.printer > 0) rows.push([...lookup, TYPE_PRINTER, String(a.printer), "ijara"]);
    if (a.router > 0) rows.push([...lookup, TYPE_ROUTER, String(a.router), "ijara"]);
  }

  const file = path.join(outDir, "klient-baza-uskuna-ijara.csv");
  writeFileSync(
    file,
    "﻿" + [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"),
    "utf8",
  );

  console.log("=== IJARADAGI USKUNA (yuklashga tayyor) ===");
  console.log("  " + line(rent));
  console.log(`  CSV qatorlari: ${rows.length} (${byPhone.size} telefon)`);
  console.log(`  fayl: ${file}`);

  console.log("\n=== HISOBGA OLINMAGANLAR ===");
  console.log(`  Sotib olingan:  ${line(sold)}`);
  console.log(`  Otkaz/ishlatmayotgan: ${line(atkaz)}`);
  console.log(`  Uskunasi umuman yo'q (faol): ${noEquip} mijoz`);

  const unusedMixed = Object.keys(MIXED).filter((c) => !mixedUsed.has(c));
  if (unusedMixed.length) {
    console.log(`\n!! MIXED jadvalidagi shartnoma fayl ichida topilmadi: ${unusedMixed.join(", ")}`);
  }
  if (warnUnknownSold.length) {
    console.log(`\n!! Tushunarsiz "Sotib olingan" matni — qator TASHLANDI (${warnUnknownSold.length}):`);
    warnUnknownSold.forEach((w) => console.log("   " + w));
  }
  if (warnNoLookup.length) {
    console.log(`\n!! Yaroqli telefon yo'q — mijozni topib bo'lmaydi, tashlandi (${warnNoLookup.length}):`);
    warnNoLookup.forEach((w) => console.log("   " + w));
  }
  if (warnDupRow.length) {
    console.log(`\n!! Sheetda takrorlangan mijoz — ikkinchi qator tashlandi (${warnDupRow.length}):`);
    warnDupRow.forEach((w) => console.log("   " + w));
  }
  if (warnSharedPhone.length) {
    console.log(
      `\n!! Bitta telefonni ulashgan mijozlar — uskunasi QO'SHIB yozildi, qo'lda ajratish kerak (${warnSharedPhone.length}):`,
    );
    warnSharedPhone.forEach((w) => console.log("   " + w));
  }
  if (warnCheap.length) {
    console.log(`\n?  29$ va undan past, lekin ijara uskunasi bor — tekshirish kerak (${warnCheap.length}):`);
    warnCheap.forEach((w) => console.log("   " + w));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

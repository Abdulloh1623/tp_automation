/**
 * "Klient baza" (To'lov-tracker formati) sheet'idan bazada YO'Q mijozlarni qo'shadi.
 * Dedup: telefon + shartnoma raqami + F.I.O bo'yicha. FAQAT mijoz yozuvi
 * (to'lov TARIXI import qilinmaydi). Keyingi to'lov sanasi shartnoma sanasidan
 * (lib/billing.computeNextPaymentDate — yagona manba) hisoblanadi.
 *
 * Ustun xaritasi (0-indeks):
 *   0 F.I.O · 1 shartnoma sanasi (DD.MM.YYYY) · 2 oylik $ · 6 operator ·
 *   7 telefon · 8 shartnoma № · 11 izoh · 12 monoblok soni · 10 "sotib olingan"
 *
 * Ishlatish:  npx tsx scripts/import-klient-baza.ts "<csv>" [--commit]
 *   --commit bo'lmasa DRY-RUN (hech nima yozilmaydi).
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { computeNextPaymentDate } from "../src/lib/billing";

const db = new PrismaClient();

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\r") {} else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else f += c; } }
  if (f.length || row.length) { row.push(f); rows.push(row); } return rows;
}

const col = (r: string[], i: number) => (r[i] ?? "").trim();

function canonPhone(raw?: string): string {
  const first = (raw ?? "").split(/[,/|;\n]+/)[0] ?? "";
  let d = first.replace(/[^0-9]/g, ""); if (!d) return "";
  if (d.length === 11 && d.startsWith("8")) d = "998" + d.slice(1);
  if (d.startsWith("998")) return "+" + d.slice(0, 12);
  if (d.length >= 9) return "+998" + d.slice(0, 9);
  return "+" + d;
}
function extraPhones(raw?: string): string[] {
  const parts = (raw ?? "").split(/[,/|;\n]+/).slice(1);
  const out: string[] = [];
  for (const p of parts) { const c = canonPhone(p); if (c && c.length >= 12) out.push(c); }
  return out;
}
function validUzPhone(p: string): boolean {
  return /^\+998(20|33|50|55|77|88|90|91|93|94|95|97|98|99)\d{7}$/.test(p);
}
function parseDotDate(s?: string): Date | null {
  const m = (s ?? "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 9, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}
function cleanContract(raw?: string): string | null {
  const t = (raw ?? "").trim(); if (!t) return null;
  const m = t.match(/AB\s*\d[\d.]*/i); if (m) return m[0].replace(/\s+/g, "");
  if (/programma|pragramma/i.test(t)) return null; return null;
}
function money(raw?: string): number {
  const n = parseFloat((raw ?? "").replace(/[^0-9.]/g, "")); return isNaN(n) ? 0 : n;
}
function intOf(raw?: string): number {
  const n = parseInt((raw ?? "").replace(/[^0-9]/g, ""), 10); return isNaN(n) ? 0 : n;
}
function eqMode(contract?: string, sotib?: string, desc?: string): string {
  const t = `${contract ?? ""} ${sotib ?? ""} ${desc ?? ""}`.toLowerCase();
  if (t.includes("sotib")) return "SOLD";
  if (t.includes("faqat programma") || t.includes("faqat pragramma")) return "PROGRAM_ONLY";
  return "RENTAL";
}
// Izohda "olib kelingan/otkaz/yopilgan/vozvrat..." bo'lsa — faol lid EMAS (ko'rib chiqish uchun).
function isConcern(desc?: string): boolean {
  const t = (desc ?? "").toLowerCase();
  return /olib keling|olib keld|olib kel|olindi|olganlar|vozvrat|qaytar|otkaz|atkaz|yopilgan|yopgan|sudgacha|ishlatmay|sotib oldi|savdo yo'q/.test(t);
}
// Ism qavsidagi qism — joy + restoran nomi (bu sheet'da alohida ustun yo'q).
// Uni restaurantName'ga qo'yamiz; region'ni ifloslantirmaslik uchun null qoldiramiz
// (operator keyin to'g'ri viloyatni belgilaydi). `venue` = qavs ichi.
function nameAndVenue(raw: string): { name: string; venue: string } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), venue: m[2].trim() };
  return { name: raw.trim(), venue: "" };
}

async function main() {
  const csvPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!csvPath) { console.error("CSV yo'q. Ishlatish: npx tsx scripts/import-klient-baza.ts <csv> [--commit]"); process.exit(1); }
  let text = readFileSync(csvPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCSV(text);

  const clients = await db.client.findMany({ select: { phone: true, fullName: true, contractNumber: true } });
  const dbPhones = new Set(clients.map((c) => c.phone));
  const dbNames = new Set(clients.map((c) => c.fullName.trim().toLowerCase()));
  const dbContracts = new Set(clients.map((c) => c.contractNumber).filter(Boolean) as string[]);
  const users = await db.user.findMany({ select: { id: true, name: true, role: true } });
  // "operator" ustunidagi ismlar amalda USTALAR (INSTALLER). Shu bois faqat
  // assignedUstaId (o'rnatgan usta) ga biriktiramiz; assignedToId (qo'ng'iroq
  // operatori) NULL qoladi — yangi lid kunlik taqsimotga tushib operator oladi.
  const findUsta = (n?: string) => {
    const t = (n ?? "").trim().toLowerCase(); if (!t) return null;
    return users.find((u) => u.name.toLowerCase() === t && u.role === "INSTALLER")?.id ?? null;
  };

  const toCreate: any[] = [];
  const existing: string[] = [];
  const invalid: string[] = [];

  for (const r of rows) {
    const rawName = col(r, 0);
    const dateStr = col(r, 1);
    // Faqat mijoz qatorlari: ism bor + 1-ustun DD.MM.YYYY sana
    if (!rawName || rawName.toLowerCase() === "umarali") continue;
    const contractDate = parseDotDate(dateStr);
    if (!contractDate) continue;

    const phone = canonPhone(col(r, 7));
    const contractNumber = cleanContract(col(r, 8));
    const { name, venue } = nameAndVenue(rawName);
    const nameKey = name.toLowerCase();

    // Dedup — telefon / shartnoma / ism
    if ((phone && dbPhones.has(phone)) || (contractNumber && dbContracts.has(contractNumber)) || dbNames.has(nameKey)) {
      existing.push(`${name}${phone ? ` (${phone})` : ""}`);
      continue;
    }
    // Yaroqsiz telefon — ehtimol dublikat/xato, qo'shmaymiz (ko'rib chiqish uchun)
    if (!validUzPhone(phone)) { invalid.push(`${name} (${col(r, 7) || "telefonsiz"})`); continue; }

    const desc = col(r, 11);
    toCreate.push({
      fullName: name,
      restaurantName: venue, // joy+restoran (qavs ichi); region null qoldiriladi
      region: null,
      phone,
      contractNumber,
      contractDate,
      monthlyAmount: money(col(r, 2)),
      currency: "USD",
      equipmentMode: eqMode(col(r, 8), col(r, 10), desc),
      monoblokCount: intOf(col(r, 12)),
      status: "ACTIVE",
      stage: "NEW",
      installerName: col(r, 6) || null,
      assignedUstaId: findUsta(col(r, 6)),
      // assignedToId ATAYLAB null — yangi lid kunlik taqsimotga tushadi.
      nextPaymentDate: computeNextPaymentDate(contractDate),
      notes: desc || null,
      _extra: extraPhones(col(r, 7)),
      _concern: isConcern(desc),
    });
  }

  const active = toCreate.filter((c) => !c._concern);
  const concern = toCreate.filter((c) => c._concern);

  console.log(`\n=== DRY-RUN xulosa ===`);
  console.log(`Bazadagi mijozlar: ${clients.length}`);
  console.log(`Qo'shiladigan (faol lid): ${active.length}`);
  console.log(`Ko'rib chiqish kerak (izohda otkaz/olib-kelingan/yopilgan): ${concern.length}`);
  console.log(`Bazada mavjud (o'tkazildi): ${existing.length}`);
  console.log(`Yaroqsiz telefon (o'tkazildi): ${invalid.length}`);

  const fmt = (c: any) => `  ${c.fullName}${c.restaurantName ? ` — ${c.restaurantName}` : ""} | ${c.phone}${c._extra.length ? ` (+${c._extra.length})` : ""} | ${c.monthlyAmount}$ | ${c.equipmentMode} | shartnoma=${c.contractNumber ?? "—"} (${c.contractDate.toISOString().slice(0, 10)}) | usta=${c.installerName ?? "—"}${c.assignedUstaId ? "✓" : ""} | keyingi=${c.nextPaymentDate.toISOString().slice(0, 10)}`;

  console.log(`\n--- QO'SHILADI (faol lid, ${active.length}) ---`);
  active.forEach((c) => console.log(fmt(c)));
  if (concern.length) {
    console.log(`\n--- KO'RIB CHIQISH (${concern.length}) — izoh otkaz/qaytarish/yopilganni ko'rsatadi, defaultda ACTIVE ---`);
    concern.forEach((c) => console.log(`${fmt(c)}\n     izoh: ${(c.notes ?? "").slice(0, 120)}`));
  }
  if (invalid.length) console.log(`\n--- YAROQSIZ TELEFON (${invalid.length}) ---\n  ${invalid.join("; ")}`);

  if (!commit) { console.log(`\n[DRY-RUN] Yozilmadi. Qo'llash uchun: --commit`); await db.$disconnect(); return; }

  let n = 0;
  for (const c of toCreate) {
    const { _extra, _concern, ...data } = c;
    await db.client.create({
      data: { ...data, phones: _extra.length ? { create: _extra.map((number: string) => ({ label: "Qo'shimcha", number })) } : undefined },
    });
    n++;
  }
  await db.auditLog.create({ data: { action: "Klient baza sheetdan yangi mijozlar qo'shildi", entity: "Client", detail: `${n} ta` } });
  console.log(`\n[COMMIT] ${n} ta mijoz qo'shildi.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

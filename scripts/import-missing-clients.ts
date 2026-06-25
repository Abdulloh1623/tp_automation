/**
 * Biznex CRM sheet'idagi, bazada YO'Q mijozlarni qo'shadi (telefon/ism bo'yicha aniqlanadi).
 * To'liq ma'lumot: restoran, viloyat, telefon(+qo'shimcha), usta, shartnoma, oylik,
 * uskuna holati, to'lov kuni. So'ng izohlarni alohida import qiladi (import-comments).
 *
 * Ishlatish: npx tsx scripts/import-missing-clients.ts "<csv>" [--commit]
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { normalizeRegion } from "../src/lib/constants";

const db = new PrismaClient();

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\r") {} else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else f += c; } }
  if (f.length || row.length) { row.push(f); rows.push(row); } return rows;
}
function canonPhone(raw?: string): string {
  const first = (raw ?? "").split(/[,/|;\n]+/)[0] ?? "";
  let d = first.replace(/[^0-9]/g, ""); if (!d) return "";
  if (d.length === 11 && d.startsWith("8")) d = "998" + d.slice(1);
  if (d.startsWith("998")) return "+" + d.slice(0, 12);
  if (d.length >= 9) return "+998" + d.slice(0, 9);
  return "+" + d;
}
function parseUSDate(s?: string): Date | null {
  const m = (s ?? "").trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 6, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}
function cleanContract(raw?: string): string | null {
  const t = (raw ?? "").trim(); if (!t) return null;
  const m = t.match(/AB\s*\d[\d.]*/i); if (m) return m[0].replace(/\s+/g, "");
  if (/programma|pragramma/i.test(t)) return null; return t;
}
function nextPaymentFromDay(s?: string): Date | null {
  const day = parseInt((s ?? "").replace(/[^0-9]/g, ""), 10);
  if (!day || day < 1 || day > 31) return null;
  const now = new Date();
  let cand = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 9, 0, 0));
  if (cand.getTime() < now.getTime()) cand = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day, 9, 0, 0));
  return cand;
}
function eqMode(s?: string): string {
  const t = (s ?? "").toLowerCase();
  if (t.includes("sotib")) return "SOLD";
  if (t.includes("dastur") || t.includes("programma") || t.includes("faqat")) return "PROGRAM_ONLY";
  if (t.includes("arenda") || t.includes("ijara")) return "RENTAL";
  return "RENTAL";
}
// Yaroqli O'zbekiston raqami (haqiqiy operator kodi). Yaroqsiz -> ehtimol dublikat/xato.
function validUzPhone(p: string): boolean {
  return /^\+998(20|33|50|55|77|88|90|91|93|94|95|97|98|99)\d{7}$/.test(p);
}
function statusOf(s?: string): string {
  const t = (s ?? "").toLowerCase();
  if (t.includes("o'chir") || t.includes("ochiril") || t.includes("to'xtat") || t.includes("toxtat")) return "INACTIVE";
  return "ACTIVE";
}

async function main() {
  const csvPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!csvPath) { console.error("CSV yo'q"); process.exit(1); }
  let text = readFileSync(csvPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCSV(text);

  const clients = await db.client.findMany({ select: { phone: true, fullName: true } });
  const dbPhones = new Set(clients.map((c) => c.phone));
  const dbNames = new Set(clients.map((c) => c.fullName.trim().toLowerCase()));
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const findUser = (n?: string) => {
    const t = (n ?? "").trim().toLowerCase(); if (!t) return null;
    return users.find((u) => u.name.toLowerCase() === t)?.id ?? null;
  };

  const toCreate: any[] = [];
  const skipped: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const id = (row[0] ?? "").trim(); const fio = (row[1] ?? "").trim();
    if (!fio || id === "ID" || fio === "F.I.O" || id === "Barcha mijozlar") continue;
    const phone = canonPhone(row[4]);
    if ((phone && dbPhones.has(phone)) || dbNames.has(fio.toLowerCase())) continue; // mavjud
    // Yaroqsiz telefon -> ehtimol mavjud mijozning takrori (imlo/xato) -> qo'shmaymiz
    if (!validUzPhone(phone)) { skipped.push(`${fio} (${(row[4] ?? "").trim() || "telefonsiz"})`); continue; }
    // yetishmayotgan mijoz
    const extraNum = canonPhone(row[5]);
    toCreate.push({
      fullName: fio,
      restaurantName: (row[2] ?? "").trim(),
      region: normalizeRegion(row[3]),
      phone,
      contractNumber: cleanContract(row[8]),
      contractDate: parseUSDate(row[9]),
      monthlyAmount: parseFloat((row[11] ?? "").replace(/[^0-9.]/g, "")) || 0,
      currency: "USD",
      equipmentMode: eqMode(row[12]),
      status: statusOf(row[13]),
      installerName: (row[6] ?? "").trim() || null,
      assignedUstaId: findUser(row[6]),
      assignedToId: findUser(row[7]),
      nextPaymentDate: nextPaymentFromDay(row[10]),
      missedCallCount: parseInt((row[19] ?? "").replace(/[^0-9]/g, ""), 10) || 0,
      stage: "NEW",
      _extra: extraNum && extraNum !== phone ? extraNum : null,
    });
  }

  console.log("Qo'shiladigan mijozlar:", toCreate.length);
  for (const c of toCreate) console.log(`  ${c.fullName} | ${c.restaurantName} | ${c.region} | ${c.phone} | ${c.monthlyAmount}$ | usta=${c.installerName} | ${c.equipmentMode}`);
  if (skipped.length) console.log("\nO'tkazib yuborilgan (yaroqsiz telefon / ehtimol dublikat):", skipped.join("; "));

  if (!commit) { console.log("\n[DRY-RUN] --commit bering."); await db.$disconnect(); return; }

  let n = 0;
  for (const c of toCreate) {
    const { _extra, ...data } = c;
    await db.client.create({
      data: { ...data, phones: _extra ? { create: [{ label: "Qo'shimcha", number: _extra }] } : undefined },
    });
    n++;
  }
  await db.auditLog.create({
    data: { action: "Yetishmayotgan mijozlar qo'shildi (Biznex CRM)", entity: "Client", detail: `${n} ta` },
  });
  console.log(`\n[COMMIT] ${n} ta mijoz qo'shildi.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

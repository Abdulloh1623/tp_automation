/**
 * VAQTINCHALIK — bir martalik migratsiya. "Tex padderjka - Sheet1.csv" dan
 * mijoz + ijara ma'lumotlarini DB'ga import qiladi. MUHIM: kunlik commentlar
 * (16+ ustunlar) O'QILMAYDI/import QILINMAYDI — faqat mijoz ustunlari (0-9).
 *
 * Ishlatish:
 *   npx tsx scripts/import-sheet.ts "<csv-path>"                  # dry-run (hisobot)
 *   npx tsx scripts/import-sheet.ts "<csv-path>" --commit          # qo'shish (insert-only)
 *   npx tsx scripts/import-sheet.ts "<csv-path>" --reimport --commit  # oldingi importni o'chirib qayta
 *
 * --reimport: demo (SH- shartnomali) mijozlardan KEYIN yaratilgan barcha
 * mijozlarni o'chiradi (createdAt bo'yicha) — demo mijozlar tegilmaydi.
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// --- Tirnoq-aware CSV parser (vergul/yangi qator tirnoq ichida bo'lsa to'g'ri) ---
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 6, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

// Birinchi raqamni ol: "$ 51.00" -> 51, " 29 +200 ming sum soliq " -> 29
function parseAmount(s?: string): number {
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseIntOr(s: string | undefined, def: number): number {
  if (s === undefined || s.trim() === "") return def;
  const v = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return isFinite(v) ? v : def;
}

// Raqam satrini kanonik formatga: 998XXXXXXXXX (12) yoki 9 raqamli mobil -> +998...
function canonPhone(digits: string): string {
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("8")) digits = "998" + digits.slice(1);
  if (digits.startsWith("998")) return "+" + digits.slice(0, 12);
  return "+998" + digits.slice(0, 9);
}

// Bitta katakda bir nechta raqam bo'lishi mumkin: ", / | ; yangi qator" bilan ajratilgan.
// Birinchi yaroqli raqam -> asosiy; qolganlari -> {label, number} (Faza 11 ClientPhone).
function parsePhoneCell(raw?: string): { primary: string; extras: { label: string; number: string }[] } {
  const parts = (raw ?? "").split(/[,/|;\n]+/).map((s) => s.trim()).filter(Boolean);
  let primary = "";
  const extras: { label: string; number: string }[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const digits = part.replace(/[^0-9]/g, "");
    if (digits.length < 9 || digits.length > 13) continue; // raqam emas (izoh/fragment)
    const num = canonPhone(digits);
    if (!num || seen.has(num)) continue;
    seen.add(num);
    if (!primary) { primary = num; continue; }
    const label = part.replace(/[0-9()+\/,.\-]/g, " ").replace(/\s+/g, " ").trim() || "Qo'shimcha";
    extras.push({ label: label.slice(0, 40), number: num });
  }
  return { primary, extras };
}

type Rec = {
  fullName: string; restaurantName: string; region: string | null;
  phone: string; contractNumber: string | null; contractDate: Date | null;
  monthlyAmount: number; currency: string; assignedToId: string | null;
  installerName: string | null; monoblokCount: number;
  status: string; stage: string;
  extras: { label: string; number: string }[];
};

async function main() {
  const csvPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  const reimport = process.argv.includes("--reimport");
  if (!csvPath) { console.error("CSV yo'li berilmadi"); process.exit(1); }

  let text = readFileSync(csvPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM

  const rows = parseCSV(text);
  const header = rows[0] ?? [];
  console.log("Ustunlar soni:", header.length, "| Jami qator (sarlavhasiz):", rows.length - 1);

  const users = await db.user.findMany({
    where: { role: { in: ["ADMIN", "OPERATOR", "MANAGER"] } },
    select: { id: true, name: true },
  });
  const findUser = (op?: string): string | null => {
    const o = (op ?? "").trim().toLowerCase();
    if (!o) return null;
    const u = users.find(
      (x) => x.name.toLowerCase() === o || x.name.toLowerCase().includes(o),
    );
    return u?.id ?? null;
  };

  const data: Rec[] = [];
  let skippedEmpty = 0;
  let extrasTotal = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (i: number) => (row[i] ?? "").trim();
    const fio = get(0);
    const rest = get(1);
    const phoneRaw = get(4);
    if (!fio && !rest && !phoneRaw) { skippedEmpty++; continue; }

    const opName = get(3);
    const { primary, extras } = parsePhoneCell(phoneRaw);
    extrasTotal += extras.length;

    data.push({
      fullName: fio,
      restaurantName: rest,
      region: get(2) || null,
      phone: primary,
      contractNumber: get(5) || null,
      contractDate: parseDate(get(6)),
      monthlyAmount: parseAmount(get(7)),
      currency: "USD",
      assignedToId: findUser(opName),
      installerName: opName || null,
      monoblokCount: parseIntOr(get(9), 1),
      status: "ACTIVE",
      stage: "NEW",
      extras,
    });
  }

  const missingPhone = data.filter((d) => !d.phone).length;
  const missingRest = data.filter((d) => !d.restaurantName).length;
  const amtSum = data.reduce((s, d) => s + d.monthlyAmount, 0);
  const amtMax = Math.max(...data.map((d) => d.monthlyAmount));

  console.log("\n=== TAHLIL ===");
  console.log("Import mijoz:", data.length, "| bo'sh qator:", skippedEmpty);
  console.log("Telefonsiz:", missingPhone, "| restoransiz:", missingRest);
  console.log("Qo'shimcha telefon (ClientPhone):", extrasTotal);
  console.log("Oylik jami:", amtSum.toFixed(2), "| o'rtacha:", (amtSum / data.length).toFixed(2), "| max:", amtMax);
  console.log("Namuna (Narzullayeva):", JSON.stringify(data.find((d) => d.fullName.includes("Narzullayeva")), null, 1));
  console.log("Namuna (Suyunov, multi-phone):", JSON.stringify(data.find((d) => d.fullName.includes("Suyunov Arslonbek")), null, 1));

  if (!commit) {
    console.log("\n[DRY-RUN] DB'ga YOZILMADI.");
    await db.$disconnect();
    return;
  }

  if (reimport) {
    // Demo (SH- shartnomali) mijozlarning eng yangi createdAt'i = demo seed vaqti.
    // Undan keyin yaratilgan barcha mijozlar = oldingi import -> o'chiriladi.
    const demo = await db.client.findMany({
      where: { contractNumber: { startsWith: "SH-" } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (demo.length === 0) {
      console.log("[XATO] Demo (SH-) mijoz topilmadi — reimport to'xtatildi (xavfsizlik).");
      await db.$disconnect();
      return;
    }
    const cutoff = demo[0].createdAt;
    const del = await db.client.deleteMany({ where: { createdAt: { gt: cutoff } } });
    console.log(`\n[REIMPORT] Oldingi import o'chirildi: ${del.count} mijoz (cutoff ${cutoff.toISOString()}).`);
  }

  const before = await db.client.count();
  if (!reimport && before > 50) {
    console.log("\n[XAVFSIZLIK] 50+ mijoz bor — ehtimol allaqachon import. To'xtatildi (--reimport ishlating).");
    await db.$disconnect();
    return;
  }

  // Nested phones uchun birma-bir create (createMany nested'ni qo'llamaydi).
  let created = 0, phonesCreated = 0;
  for (const d of data) {
    const { extras, ...client } = d;
    await db.client.create({
      data: {
        ...client,
        phones: extras.length ? { create: extras } : undefined,
      },
    });
    created++;
    phonesCreated += extras.length;
  }
  await db.auditLog.create({
    data: {
      action: "Mijozlar import qilindi (Tex padderjka sheet, CSV)",
      entity: "Client",
      detail: `qo'shildi: ${created}, qo'shimcha telefon: ${phonesCreated}, telefonsiz: ${missingPhone}, restoransiz: ${missingRest}`,
    },
  });
  const after = await db.client.count();
  console.log(`\n[COMMIT] Mijoz qo'shildi: ${created}, qo'shimcha telefon: ${phonesCreated}. DB endi: ${after} mijoz.`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

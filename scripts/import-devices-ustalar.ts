/**
 * To'liq import (2-bosqich): ustalar (INSTALLER) + devicelar (ClientEquipment) +
 * ijara/sotuv holati. Mavjud 352 mijozni TO'LDIRADI (augment), qaytadan yaratmaydi.
 * Idempotent: CSV col7 (jami) dan hisoblaydi, ustalarni find-or-create, ClientEquipment
 * ni clientId bo'yicha qayta yozadi.
 *
 * Ishlatish:  npx tsx scripts/import-devices-ustalar.ts "<csv>" [--commit]
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\r") {} else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else f += c; } }
  if (f.length || row.length) { row.push(f); rows.push(row); } return rows;
}
function parseAmount(s?: string): number {
  if (!s) return 0; const m = s.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0;
}
// Toza butun son (narx/bo'sh -> null)
function cleanCount(s?: string): number | null {
  const t = (s ?? "").trim();
  if (!t || /[$.,]/.test(t)) return null;
  const n = parseInt(t, 10);
  return isFinite(n) && n >= 0 && n <= 50 ? n : null;
}
// "Apparat sotib olingan" -> sotuvmi?
function isSold(s?: string): boolean {
  const t = (s ?? "").trim().toLowerCase();
  if (!t) return false;
  if (t.includes("sotib") || t.includes("qilgan")) return true;
  if (t.includes("$")) return /\d/.test(t); // "$220" -> sotuv, "$-" -> yo'q
  const n = parseInt(t.replace(/[^0-9]/g, ""), 10);
  return isFinite(n) && n > 0; // "1","2" -> sotuv; "0" -> yo'q
}
// Usta nomini kanoniklashtirish (variantlarni birlashtirish; "O'zi ..." -> null)
function canonInstaller(s?: string): string | null {
  const t = (s ?? "").trim(); if (!t) return null;
  const low = t.toLowerCase().replace(/[‘’ʻʼ`´]/g, "'");
  if (low.includes("o'zi") || low.includes("ozi ")) return null;
  const map: Record<string, string> = {
    "xojiakbar": "Hojiakbar", "hojiakbar": "Hojiakbar",
    "shaxzod": "Shahzod", "shahzod": "Shahzod",
    "ismoyil": "Ismoil", "ismoil": "Ismoil",
    "abbos top": "Abbos", "abbos": "Abbos",
  };
  return map[low] ?? t;
}
function slug(name: string): string {
  return name.toLowerCase().replace(/[‘’ʻʼ`´']/g, "").replace(/[^a-z0-9]+/g, "");
}
// Telefonni DB kanonik formatiga (+998XXXXXXXXX) — moslashtirish uchun
function canonPhone(raw?: string): string {
  const first = (raw ?? "").split(/[,/|;\n]+/)[0] ?? "";
  let d = first.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.length === 11 && d.startsWith("8")) d = "998" + d.slice(1);
  if (d.startsWith("998")) return "+" + d.slice(0, 12);
  if (d.length >= 9) return "+998" + d.slice(0, 9);
  return "+" + d;
}
// col5 dan toza shartnoma (AB...) ajratib olish; "faqat programma" -> null
function cleanContract(raw?: string): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const m = t.match(/AB\s*\d[\d.]*/i);
  if (m) return m[0].replace(/\s+/g, "");
  if (/programma|pragramma/i.test(t)) return null; // izoh, shartnoma emas
  return t; // boshqa holatlar — o'zicha
}

async function main() {
  const csvPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!csvPath) { console.error("CSV yo'li yo'q"); process.exit(1); }
  let text = readFileSync(csvPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCSV(text);

  // Texnika turlari
  const types = await db.equipmentType.findMany();
  const typeByKey = (k: "mono" | "prn" | "rtr") => {
    const find = (frag: string) => types.find((t) => t.name.toLowerCase().includes(frag));
    return k === "mono" ? find("monoblok") : k === "prn" ? find("printer") : find("router");
  };
  const monoT = typeByKey("mono"), prnT = typeByKey("prn"), rtrT = typeByKey("rtr");
  if (!monoT || !prnT || !rtrT) { console.error("Texnika turi topilmadi"); process.exit(1); }

  // Mijoz xaritasi — telefon (ishonchli) + ism (zaxira). Shartnoma ishlatilmaydi
  // (unda "faqat programma" kabi izohlar bor — takror/noaniq).
  const clients = await db.client.findMany({ select: { id: true, phone: true, fullName: true } });
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of clients) {
    if (c.phone) byPhone.set(c.phone.trim(), c.id);
    byName.set(c.fullName.trim(), c.id);
  }

  // --- Ustalar (find-or-create) ---
  const installerNames = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const n = canonInstaller(rows[r][3]);
    if (n) installerNames.add(n);
  }
  const hash = await bcrypt.hash("parol123", 10);
  const ustaMap = new Map<string, string>(); // canonName -> userId
  const createdUstalar: string[] = [];
  const existingUsers = await db.user.findMany({ select: { id: true, name: true, username: true } });
  for (const name of installerNames) {
    const exist = existingUsers.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (exist) { ustaMap.set(name, exist.id); continue; }
    if (commit) {
      let uname = slug(name); let n = 1;
      while (existingUsers.some((u) => u.username === uname) || createdUstalar.includes(uname)) { uname = slug(name) + ++n; }
      const u = await db.user.create({
        data: { name, username: uname, passwordHash: hash, role: "INSTALLER", isActive: true },
      });
      ustaMap.set(name, u.id);
      createdUstalar.push(uname);
    } else {
      createdUstalar.push(slug(name));
    }
  }

  // --- Mijozlar bo'yicha device + holat ---
  let matched = 0, notFound = 0, withEquip = 0, soldCount = 0, eqRows = 0, linkedUsta = 0;
  let monoDefault = 0;
  const ownershipSummary = (own: string, parts: string[]) =>
    (parts.length ? parts.join(" · ") : "") + (parts.length ? ` — ${own === "SOLD" ? "Sotuv" : "Ijara"}` : (own === "SOLD" ? "Sotib olingan" : ""));

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (i: number) => (row[i] ?? "").trim();
    const fio = get(0), rest = get(1), ph = get(4);
    if (!fio && !rest && !ph) continue;

    const clientId = byPhone.get(canonPhone(get(4))) ?? byName.get(fio);
    if (!clientId) { notFound++; continue; }
    matched++;

    const total = parseAmount(get(7));
    const mono = cleanCount(get(9));
    const prn = cleanCount(get(12));
    const rtr = cleanCount(get(14));
    const hasCounts = mono !== null || prn !== null || rtr !== null;
    const sold = isSold(get(8));
    const ownership = sold ? "SOLD" : "RENTAL";

    // Device ro'yxati (faqat toza son > 0)
    const eq: { equipmentTypeId: string; quantity: number; ownership: string; rental: number }[] = [];
    if (mono && mono > 0) eq.push({ equipmentTypeId: monoT.id, quantity: mono, ownership, rental: monoT.rentalPrice });
    if (prn && prn > 0) eq.push({ equipmentTypeId: prnT.id, quantity: prn, ownership, rental: prnT.rentalPrice });
    if (rtr && rtr > 0) eq.push({ equipmentTypeId: rtrT.id, quantity: rtr, ownership, rental: rtrT.rentalPrice });

    // equipmentMode
    const programOnly = /programma|pragramma/i.test(get(5)) || /programma|pragramma/i.test(get(8));
    let mode: string;
    if (sold) mode = "SOLD";
    else if (eq.length > 0) mode = "RENTAL";
    else if (programOnly || (hasCounts && eq.length === 0)) mode = "PROGRAM_ONLY";
    else mode = "RENTAL"; // to'lov qiladi, lekin son noma'lum

    // monthlyAmount = JAMI (mijoz to'laydigan to'liq summa). Uskunalar device/holat
    // kuzatuvi uchun ClientEquipment'da saqlanadi, lekin oylikка alohida QO'SHILMAYDI
    // (ikki marta hisoblamaslik). Detal sahifasi ham monthlyAmount'ni jami deb ko'rsatadi.
    const base = total;

    // Summary matn
    const parts: string[] = [];
    if (mono && mono > 0) parts.push(`Monoblok×${mono}`);
    if (prn && prn > 0) parts.push(`Printer×${prn}`);
    if (rtr && rtr > 0) parts.push(`Router×${rtr}`);
    const equipText = ownershipSummary(ownership, parts) || null;

    const ustaId = ustaMap.get(canonInstaller(get(3)) ?? "") ?? null;
    if (ustaId) linkedUsta++;
    if (sold) soldCount++;
    if (eq.length > 0) { withEquip++; eqRows += eq.length; }
    if (mono === null) monoDefault++;

    if (commit) {
      await db.client.update({
        where: { id: clientId },
        data: {
          assignedUstaId: ustaId ?? undefined,
          equipmentMode: mode,
          monoblokCount: mono ?? 1,
          monthlyAmount: base,
          equipment: equipText,
          contractNumber: cleanContract(get(5)),
        },
      });
      await db.clientEquipment.deleteMany({ where: { clientId } });
      if (eq.length > 0) {
        await db.clientEquipment.createMany({
          data: eq.map((e) => ({ clientId, equipmentTypeId: e.equipmentTypeId, quantity: e.quantity, ownership: e.ownership })),
        });
      }
    }
  }

  console.log("=== USTALAR ===");
  console.log("Aniqlangan ustalar:", installerNames.size, "->", [...installerNames].join(", "));
  console.log(commit ? `Yaratilgan/yangi login: ${createdUstalar.join(", ")}` : `(dry) login bo'lardi: ${createdUstalar.join(", ")}`);
  console.log("\n=== MIJOZLAR ===");
  console.log("Mos kelgan:", matched, "| topilmadi:", notFound);
  console.log("Ustaga bog'langan:", linkedUsta);
  console.log("ClientEquipment yaratilgan mijoz:", withEquip, `(${eqRows} yozuv)`);
  console.log("Sotuv (SOLD) holati:", soldCount, "| qolgani Ijara");
  console.log("Monoblok soni noma'lum -> default 1:", monoDefault);

  if (commit) {
    await db.auditLog.create({
      data: { action: "To'liq import: ustalar + devicelar (sheet)", entity: "Client",
        detail: `usta: ${createdUstalar.length} yangi, equip mijoz: ${withEquip}, sold: ${soldCount}` },
    });
    console.log("\n[COMMIT] Bajarildi.");
  } else {
    console.log("\n[DRY-RUN] --commit bering.");
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

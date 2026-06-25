/**
 * Biznex CRM sheet'idan mijoz izohlarini (sana + natija + izoh) CallLog sifatida import.
 * Telefon (zaxira: ism) bo'yicha mavjud mijozga bog'lanadi. Idempotent: har mijozning
 * importlangan (operatorId=null) qo'ng'iroqlarini qayta yozadi.
 *
 * Ishlatish: npx tsx scripts/import-comments.ts "<csv>" [--commit]
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

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
  let d = first.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.length === 11 && d.startsWith("8")) d = "998" + d.slice(1);
  if (d.startsWith("998")) return "+" + d.slice(0, 12);
  if (d.length >= 9) return "+998" + d.slice(0, 9);
  return "+" + d;
}
// M/D/YYYY -> Date (UTC)
function parseUSDate(s?: string): Date | null {
  const m = (s ?? "").trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 6, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}
const OUTCOME: Record<string, string> = {
  "ko'tarmadi": "NO_ANSWER",
  "noaniq / aloqa yo'q": "NO_ANSWER",
  "gaplashildi": "TALKED",
  "faol – muammosiz": "NO_PROBLEM",
  "faol - muammosiz": "NO_PROBLEM",
  "muammo bor": "HAS_ISSUE",
  "to'lov qildi": "PAID",
  "ertaga to'laydi": "WILL_PAY_TOMORROW",
  "o'chirilgan": "DEACTIVATED",
  "to'xtatgan": "DEACTIVATED",
  "atkaz": "DEACTIVATED",
};
function mapOutcome(s?: string): string {
  const t = (s ?? "").trim().replace(/[‘’ʻʼ`´]/g, "'").toLowerCase();
  return OUTCOME[t] ?? ((s ?? "").trim() || "TALKED");
}

async function main() {
  const csvPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!csvPath) { console.error("CSV yo'li yo'q"); process.exit(1); }
  let text = readFileSync(csvPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCSV(text);

  const clients = await db.client.findMany({ select: { id: true, phone: true, fullName: true } });
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of clients) { if (c.phone) byPhone.set(c.phone.trim(), c.id); byName.set(c.fullName.trim().toLowerCase(), c.id); }

  let total = 0, matched = 0, created = 0, noComment = 0;
  const unmatched: string[] = [];
  const outcomeStat = new Map<string, number>();

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const id = (row[0] ?? "").trim();
    const fio = (row[1] ?? "").trim();
    // sarlavha/bo'sh qatorlarni o'tkazib yuborish
    if (!fio || id === "ID" || fio === "F.I.O" || id === "Barcha mijozlar") continue;
    total++;

    const note = (row[17] ?? "").trim();
    if (!note) { noComment++; continue; }

    const clientId = byPhone.get(canonPhone(row[4])) ?? byName.get(fio.toLowerCase());
    if (!clientId) { unmatched.push(`${fio} (${(row[4] ?? "").trim()})`); continue; }
    matched++;

    const calledAt = parseUSDate(row[14]) ?? parseUSDate(row[9]) ?? new Date();
    const result = mapOutcome(row[16]);
    outcomeStat.set(result, (outcomeStat.get(result) ?? 0) + 1);

    if (commit) {
      // idempotent: oldin importlangan (operatorsiz) qo'ng'iroqlarni tozalash
      await db.callLog.deleteMany({ where: { clientId, operatorId: null } });
      await db.callLog.create({
        data: { clientId, calledAt, result, note, nextFollowUpDate: parseUSDate(row[15]) },
      });
      await db.client.update({
        where: { id: clientId },
        data: { lastContactedAt: calledAt, lastOutcome: result },
      });
      created++;
    }
  }

  console.log("=== IZOH IMPORT ===");
  console.log("Data qator:", total, "| izohsiz:", noComment, "| mos kelgan:", matched);
  console.log("Topilmagan (bazada yo'q):", unmatched.length);
  if (unmatched.length) console.log("  ", unmatched.slice(0, 20).join("; "));
  console.log("\nNatija taqsimoti (kod):");
  [...outcomeStat.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  if (commit) {
    await db.auditLog.create({
      data: { action: "Mijoz izohlari import qilindi (Biznex CRM sheet)", entity: "CallLog",
        detail: `qo'ng'iroq yozuvi: ${created}, mos: ${matched}, topilmadi: ${unmatched.length}` },
    });
    console.log(`\n[COMMIT] ${created} ta qo'ng'iroq yozuvi (izoh) yaratildi.`);
  } else {
    console.log("\n[DRY-RUN] --commit bering.");
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

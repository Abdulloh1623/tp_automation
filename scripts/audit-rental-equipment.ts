/**
 * Ijara uskunasi auditi va shartnomalardan to'ldirish.
 *
 * BIZNES QOIDASI (lib/constants.ts -> BASE_PROGRAM_USD):
 *   oylik = $29  -> faqat dastur, uskuna ijarasi YO'Q
 *   oylik > $29  -> farq uskuna ijarasi, ya'ni mijozda ijara uskunasi BOR
 * Qoida faqat USD mijozlarga qo'llanadi.
 *
 * Ikki rejim:
 *
 * 1) AUDIT (default) — hech nima yozmaydi, faqat nomuvofiqliklarni chiqaradi.
 *    Sahifadagi (/uskuna-analitika) hisob bilan AYNI funksiyani ishlatadi
 *    (check29Rule) — raqamlar bir-biridan farq qilmaydi.
 *
 *      npx tsx scripts/audit-rental-equipment.ts
 *      npx tsx scripts/audit-rental-equipment.ts --out=audit.csv   # ro'yxatni CSV'ga
 *
 * 2) TO'LDIRISH — shartnoma ma'lumoti bo'yicha CSV'dan ijara uskunasini yozadi.
 *
 *      npx tsx scripts/audit-rental-equipment.ts --csv=shartnomalar.csv          # DRY-RUN
 *      npx tsx scripts/audit-rental-equipment.ts --csv=shartnomalar.csv --commit # yozadi
 *
 *    CSV formati — birinchi qator sarlavha:
 *      - mijozni topish ustuni (biri yetarli, shu tartibda qidiriladi):
 *        `shartnoma` (contractNumber) | `telefon` (phone) | `restoran` (restaurantName)
 *      - har bir texnika turi uchun bitta ustun, sarlavhasi Ombor'dagi tur NOMI
 *        bilan bir xil bo'lishi kerak (masalan `Monoblok`, `Printer`).
 *      Namuna:
 *        shartnoma,Monoblok,Printer
 *        TP-104,2,1
 *        TP-118,1,0
 *
 * MUHIM:
 *  - Faqat `ClientEquipment` (RENTAL) YOZADI. Ombor/usta qoldig'iga (InventoryStock)
 *    TEGMAYDI — bu tarixiy o'rnatishlar, sklad hisobidan allaqachon chiqib ketgan
 *    (backfill-rental-equipment.ts bilan bir xil yondashuv).
 *  - Billing'ga (monthlyAmount) TEGMAYDI. Ijara — oylik to'lov ICHIDAGI ulush,
 *    ustiga QO'SHILMAYDI (aks holda daromad ikki marta sanaladi).
 *  - Idempotent: mavjud miqdorni CSV'dagi songa TENGLASHTIRADI (qo'shmaydi).
 *    Qayta ishga tushirish xavfsiz.
 *  - CSV'da 0 turgan tur — mavjud yozuv O'CHIRILADI (mijozda u uskuna yo'q).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { parseCsvWithHeader } from "../src/lib/csv";
import { check29Rule, expectedRentalValue, type RuleClient } from "../src/lib/inventory-stats";
import { BASE_PROGRAM_USD } from "../src/lib/constants";

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const norm = (s: string) => s.trim().toLowerCase();
const digits = (s: string) => s.replace(/\D/g, "");

/** Mijozni topish uchun sarlavha nomlari (o'zbekcha/inglizcha variantlar). */
const KEY_COLUMNS: { field: "contract" | "phone" | "name"; aliases: string[] }[] = [
  { field: "contract", aliases: ["shartnoma", "shartnoma raqami", "contract", "contractnumber"] },
  { field: "phone", aliases: ["telefon", "tel", "phone", "raqam"] },
  { field: "name", aliases: ["restoran", "restoran nomi", "mijoz", "restaurantname", "nomi"] },
];

async function loadRuleClients(): Promise<RuleClient[]> {
  const [clients, equipment] = await Promise.all([
    db.client.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, restaurantName: true, monthlyAmount: true, currency: true },
    }),
    db.clientEquipment.findMany({
      where: { ownership: "RENTAL", quantity: { gt: 0 } },
      select: { clientId: true, quantity: true },
    }),
  ]);
  const rented = new Map<string, number>();
  for (const e of equipment) {
    rented.set(e.clientId, (rented.get(e.clientId) ?? 0) + e.quantity);
  }
  return clients.map((c) => ({
    id: c.id,
    restaurantName: c.restaurantName,
    monthlyAmount: c.monthlyAmount,
    currency: c.currency,
    rentedQty: rented.get(c.id) ?? 0,
  }));
}

async function audit() {
  const clients = await loadRuleClients();
  const r = check29Rule(clients);

  console.log(`=== IJARA USKUNASI AUDITI (bazaviy narx: $${BASE_PROGRAM_USD}) ===`);
  console.log(`Faol mijozlar: ${clients.length}`);
  console.log(
    `  tekshirildi (USD, oyligi > 0): ${r.checked} — shundan to'g'ri: ${r.okCount}`,
  );
  console.log(`  tekshirilmadi: ${r.skippedNonUsd} so'mli, ${r.skippedZero} oyligi kiritilmagan`);
  console.log("");
  console.log(`[1] $${BASE_PROGRAM_USD} to'laydi, LEKIN uskunasi bor: ${r.baseWithEquipment.length}`);
  console.log(
    `[2] $${BASE_PROGRAM_USD} dan ORTIQ to'laydi, uskunasi YO'Q: ${r.aboveBaseWithoutEquipment.length}`,
  );
  console.log(`[3] Oyligi $${BASE_PROGRAM_USD} dan PAST: ${r.belowBase.length}`);

  const show = (title: string, items: RuleClient[]) => {
    if (items.length === 0) return;
    console.log(`\n--- ${title} (dastlabki 20) ---`);
    for (const c of items.slice(0, 20)) {
      const exp = expectedRentalValue(c.monthlyAmount, c.currency);
      console.log(
        `  ${c.restaurantName.padEnd(32).slice(0, 32)} $${String(c.monthlyAmount).padStart(6)}` +
          `  uskuna: ${c.rentedQty}` +
          (exp > 0 ? `  (kutilgan ijara ulushi: $${exp}/oy)` : ""),
      );
    }
    if (items.length > 20) console.log(`  ... yana ${items.length - 20} ta`);
  };
  show(`$${BASE_PROGRAM_USD} + uskunasi bor`, r.baseWithEquipment);
  show(`$${BASE_PROGRAM_USD} dan ortiq, uskunasi yo'q`, r.aboveBaseWithoutEquipment);
  show(`Bazaviy narxdan past`, r.belowBase);

  const out = arg("out");
  if (out) {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const line = (problem: string, c: RuleClient) =>
      [
        problem,
        c.restaurantName,
        c.monthlyAmount,
        c.currency,
        c.rentedQty,
        expectedRentalValue(c.monthlyAmount, c.currency),
      ]
        .map(esc)
        .join(",");

    const lines = [
      ["Muammo", "Mijoz", "Oylik", "Valyuta", "Ijara uskunasi (dona)", "Kutilgan ijara ($/oy)"]
        .map(esc)
        .join(","),
      ...r.baseWithEquipment.map((c) => line("Bazaviy narx + uskuna", c)),
      ...r.aboveBaseWithoutEquipment.map((c) => line("Ortiq to'lov, uskuna yo'q", c)),
      ...r.belowBase.map((c) => line("Bazaviydan past", c)),
    ];
    // BOM — Excel UTF-8'ni to'g'ri o'qishi uchun (eksport route'lari bilan bir xil).
    writeFileSync(out, "﻿" + lines.join("\n"), "utf8");
    console.log(`\nCSV yozildi: ${out} (${lines.length - 1} qator)`);
  }

  console.log(
    `\nTo'ldirish uchun: shartnomalardan CSV tayyorlab --csv=fayl.csv bilan ishga tushiring.`,
  );
}

async function backfill(csvPath: string, commit: boolean) {
  const parsed = parseCsvWithHeader(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  if (parsed.rows.length === 0) {
    console.error("XATO: CSV bo'sh yoki faqat sarlavha bor.");
    process.exit(1);
  }
  const headers = parsed.headers.map(norm);

  // Mijozni topish ustuni.
  let keyField: "contract" | "phone" | "name" | null = null;
  let keyIdx = -1;
  for (const k of KEY_COLUMNS) {
    const i = headers.findIndex((h) => k.aliases.includes(h));
    if (i >= 0) {
      keyField = k.field;
      keyIdx = i;
      break;
    }
  }
  if (!keyField) {
    console.error(
      "XATO: mijozni topish ustuni yo'q. Sarlavhada 'shartnoma', 'telefon' yoki 'restoran' bo'lishi kerak.",
    );
    console.error(`Topilgan sarlavhalar: ${parsed.headers.join(", ")}`);
    process.exit(1);
  }

  // Texnika turi ustunlari — sarlavhasi EquipmentType.name bilan mos keladiganlar.
  const types = await db.equipmentType.findMany({ select: { id: true, name: true } });
  const typeCols: { idx: number; id: string; name: string }[] = [];
  for (const t of types) {
    const i = headers.findIndex((h) => h === norm(t.name));
    if (i >= 0) typeCols.push({ idx: i, id: t.id, name: t.name });
  }
  if (typeCols.length === 0) {
    console.error(
      `XATO: texnika ustuni topilmadi. Sarlavhada tur nomi bo'lishi kerak: ${types.map((t) => t.name).join(", ")}`,
    );
    process.exit(1);
  }

  const clients = await db.client.findMany({
    select: { id: true, restaurantName: true, contractNumber: true, phone: true },
  });
  const byContract = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of clients) {
    if (c.contractNumber) byContract.set(norm(c.contractNumber), c.id);
    if (c.phone) byPhone.set(digits(c.phone).slice(-9), c.id);
    byName.set(norm(c.restaurantName), c.id);
  }

  const existing = await db.clientEquipment.findMany({
    where: { ownership: "RENTAL" },
    select: { id: true, clientId: true, equipmentTypeId: true, quantity: true },
  });
  const exKey = (clientId: string, typeId: string) => `${clientId}|${typeId}`;
  const exMap = new Map(existing.map((e) => [exKey(e.clientId, e.equipmentTypeId), e]));

  const creates: { clientId: string; equipmentTypeId: string; quantity: number; ownership: string }[] = [];
  const updates: { id: string; quantity: number }[] = [];
  const deletes: string[] = [];
  const touched = new Set<string>(); // equipmentMode ni qayta hisoblash uchun
  const notFound: string[] = [];
  let unchanged = 0;
  const preview: string[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const raw = (row[keyIdx] ?? "").trim();
    if (!raw) continue;
    const clientId =
      keyField === "contract"
        ? byContract.get(norm(raw))
        : keyField === "phone"
          ? byPhone.get(digits(raw).slice(-9))
          : byName.get(norm(raw));
    if (!clientId) {
      notFound.push(`${parsed.lines[i]}-satr: "${raw}"`);
      continue;
    }

    for (const tc of typeCols) {
      const cell = (row[tc.idx] ?? "").trim();
      if (cell === "") continue; // bo'sh katak — tegmaymiz (0 dan FARQLI)
      const qty = Number(cell.replace(",", "."));
      if (!Number.isFinite(qty) || qty < 0) {
        notFound.push(`${parsed.lines[i]}-satr: "${tc.name}" ustunida noto'g'ri son "${cell}"`);
        continue;
      }
      const ex = exMap.get(exKey(clientId, tc.id));
      const n = Math.round(qty);
      if (ex) {
        if (ex.quantity === n) unchanged++;
        else if (n === 0) deletes.push(ex.id);
        else updates.push({ id: ex.id, quantity: n });
      } else if (n > 0) {
        creates.push({ clientId, equipmentTypeId: tc.id, quantity: n, ownership: "RENTAL" });
      } else {
        unchanged++;
      }
      if ((ex?.quantity ?? 0) !== n) {
        touched.add(clientId);
        if (preview.length < 15) {
          const name = clients.find((c) => c.id === clientId)!.restaurantName;
          preview.push(`  ${name} — ${tc.name}: ${ex?.quantity ?? 0} -> ${n}`);
        }
      }
    }
  }

  console.log("=== SHARTNOMALARDAN IJARA USKUNASINI TO'LDIRISH ===");
  console.log(`CSV: ${csvPath}`);
  console.log(`Mijoz ustuni: ${keyField} ("${parsed.headers[keyIdx]}")`);
  console.log(`Texnika ustunlari: ${typeCols.map((t) => t.name).join(", ")}`);
  console.log(`Qatorlar: ${parsed.rows.length}`);
  console.log(`  yangi yoziladi:   ${creates.length}`);
  console.log(`  yangilanadi:      ${updates.length}`);
  console.log(`  o'chiriladi (0):  ${deletes.length}`);
  console.log(`  o'zgarishsiz:     ${unchanged}`);
  if (notFound.length > 0) {
    console.log(`\nDIQQAT — ${notFound.length} ta qator qo'llanmadi:`);
    for (const n of notFound.slice(0, 20)) console.log(`  ${n}`);
    if (notFound.length > 20) console.log(`  ... yana ${notFound.length - 20} ta`);
  }
  if (preview.length > 0) {
    console.log("\nNamuna (dastlabki 15):");
    console.log(preview.join("\n"));
  }

  if (!commit) {
    console.log("\n[DRY-RUN] Hech nima yozilmadi. Yozish uchun: --commit");
    return;
  }
  if (creates.length + updates.length + deletes.length === 0) {
    console.log("\n[COMMIT] O'zgarish yo'q.");
    return;
  }

  await db.$transaction(async (tx) => {
    if (creates.length) await tx.clientEquipment.createMany({ data: creates });
    for (const u of updates) {
      await tx.clientEquipment.update({ where: { id: u.id }, data: { quantity: u.quantity } });
    }
    if (deletes.length) {
      await tx.clientEquipment.deleteMany({ where: { id: { in: deletes } } });
    }

    // equipmentMode mijozning uskunasidan kelib chiqadi (actions/equipment.ts
    // dagi syncEquipmentMode bilan bir xil qoida) — yozgandan keyin moslaymiz,
    // aks holda mijoz kartasi "faqat dastur" deb qolib ketadi.
    for (const clientId of touched) {
      const items = await tx.clientEquipment.findMany({
        where: { clientId, quantity: { gt: 0 } },
        select: { ownership: true },
      });
      const mode = items.some((i) => i.ownership === "RENTAL")
        ? "RENTAL"
        : items.some((i) => i.ownership === "SOLD")
          ? "SOLD"
          : "PROGRAM_ONLY";
      await tx.client.update({ where: { id: clientId }, data: { equipmentMode: mode } });
    }

    await tx.auditLog.create({
      data: {
        action: "Shartnomalardan ijara uskunasi to'ldirildi",
        entity: "Client",
        detail: `${creates.length} yangi, ${updates.length} yangilandi, ${deletes.length} o'chirildi (manba: ${csvPath})`,
      },
    });
  });
  console.log(
    `\n[COMMIT] Bajarildi: ${creates.length} yangi, ${updates.length} yangilandi, ${deletes.length} o'chirildi.`,
  );
  console.log("Endi auditni qayta ishga tushiring va /uskuna-analitika sahifasini tekshiring.");
}

async function main() {
  const csv = arg("csv");
  if (csv) await backfill(csv, process.argv.includes("--commit"));
  else await audit();
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

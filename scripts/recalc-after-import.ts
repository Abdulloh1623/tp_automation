/**
 * Tarixiy import tugagach: mijozlarning keyingi to'lov sanasini to'lovlar
 * tarixidan qayta hisoblaydi.
 *
 * ODATDA AVVAL FAQAT KO'RSATADI — hech narsa yozmaydi. Yozish uchun `--apply`.
 *
 *   npx tsx scripts/recalc-after-import.ts                # ko'rish (xavfsiz)
 *   npx tsx scripts/recalc-after-import.ts --forward-only # faqat oldinga suriladiganlarni ko'rish
 *   npx tsx scripts/recalc-after-import.ts --apply        # qo'llash
 *   npx tsx scripts/recalc-after-import.ts --apply --forward-only
 *
 * NEGA EHTIYOT BO'LISH KERAK: Telegram guruhidagi cheklar mijozning BUTUN
 * to'lov tarixini qamrab olmaydi (guruh qachondir boshlangan). Shuning uchun
 * tarixdan hisoblangan sana hozirgisidan OLDINROQ chiqishi mumkin — bu to'lovi
 * joyida turgan mijozni qarzdorga aylantiradi. Shunday qatorlar `← ORQAGA` deb
 * ajratib ko'rsatiladi; `--forward-only` ularni butunlay chetlab o'tadi.
 */
import { PrismaClient } from "@prisma/client";
import { planNextPayment, applyNextPaymentPlan } from "../src/lib/payment-core";

const db = new PrismaClient();

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const forwardOnly = args.includes("--forward-only");

  // Faqat tarixiy import qilingan va TASDIQLANGAN cheklarga tegishli mijozlar
  const rows = await db.pendingPayment.findMany({
    where: { source: "HISTORY", status: "CONFIRMED", suggestedClientId: { not: null } },
    select: { suggestedClientId: true },
    distinct: ["suggestedClientId"],
  });
  const clientIds = rows
    .map((r) => r.suggestedClientId)
    .filter((id): id is string => !!id);

  if (clientIds.length === 0) {
    console.log("Tasdiqlangan tarixiy to'lov yo'q — qayta hisoblash kerak emas.");
    return;
  }

  console.log(`${clientIds.length} ta mijoz tekshirilmoqda...\n`);
  const plan = await planNextPayment(clientIds);

  const forward = plan.filter((p) => p.direction === "forward");
  const backward = plan.filter((p) => p.direction === "backward");
  const same = plan.filter((p) => p.direction === "same");

  const show = (title: string, list: typeof plan, marker: string) => {
    if (list.length === 0) return;
    console.log(`${title} (${list.length}):`);
    for (const r of list) {
      console.log(
        `  ${marker} ${r.restaurantName.padEnd(34).slice(0, 34)} ` +
          `${fmt(r.current)}  →  ${fmt(r.next)}`,
      );
    }
    console.log("");
  };

  show("OLDINGA suriladi", forward, "→");
  show("ORQAGA suriladi — DIQQAT", backward, "←");
  if (same.length) console.log(`O'zgarmaydi: ${same.length} ta mijoz\n`);

  if (backward.length > 0) {
    console.log(
      `⚠ ${backward.length} ta mijozning sanasi ORQAGA suriladi — ular qarzdor\n` +
        `  bo'lib ko'rinadi. Sabab: guruhdagi cheklar ularning to'liq to'lov\n` +
        `  tarixini qamramaydi. Ishonchingiz komil bo'lmasa --forward-only ishlating.\n`,
    );
  }

  const target = forwardOnly ? forward : [...forward, ...backward];

  if (!apply) {
    console.log(
      `[KO'RISH REJIMI] Hech narsa yozilmadi.\n` +
        `Qo'llash uchun: npx tsx scripts/recalc-after-import.ts --apply` +
        (backward.length && !forwardOnly ? " --forward-only" : ""),
    );
    console.log(`Qo'llansa o'zgaradi: ${target.length} ta mijoz`);
    return;
  }

  const changed = await applyNextPaymentPlan(target);
  console.log(`✓ Qo'llandi: ${changed} ta mijozning to'lov sanasi yangilandi.`);
  if (forwardOnly && backward.length) {
    console.log(`  (${backward.length} ta orqaga suriladigan mijoz tegilmadi)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

// Moliyaviy ko'rsatkichlar — MRR, churn (yo'qotish), oylik o'sish va qarzdorlik
// yoshi. Barcha hisob bitta `Client` so'rovidan (JS'da) chiqadi — mijozlar soni
// kichik (~yuzlab). Valyutalar HECH QACHON birlashtirilmaydi: USD va UZS alohida
// (`Money`), boshqa hisobotlar (reports.ts) bilan bir xil konvensiya.

import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { db } from "./db";
import { NO_CONTACT_STAGES, type LeadStage } from "./constants";

export type Money = { USD: number; UZS: number };
export const emptyMoney = (): Money => ({ USD: 0, UZS: 0 });
function addMoney(m: Money, currency: string, amount: number) {
  m[currency === "UZS" ? "UZS" : "USD"] += amount;
}

const noContact = new Set<string>(NO_CONTACT_STAGES as LeadStage[]);

// Mijozning joriy holati bo'yicha "yo'qotilgan" (churn)mi. INACTIVE status yoki
// otkaz/o'chirilgan bosqich — ikkalasi ham yo'qotish (deactivatedAt yoziladi).
function isChurned(c: { status: string; stage: string }): boolean {
  return c.status === "INACTIVE" || noContact.has(c.stage);
}

// MRR uchun "faol"mi — churn bo'lmagan va oyligi bor mijoz.
function isMrrActive(c: { status: string; stage: string; monthlyAmount: number }): boolean {
  return !isChurned(c) && c.monthlyAmount > 0;
}

export type AgingBucket = {
  key: "b30" | "b60" | "b90" | "b90plus";
  label: string;
  count: number;
  sum: Money;
};

export type MonthPoint = {
  key: string; // "2026-07"
  label: string; // "Iyul"
  newCount: number;
  lostCount: number;
  churnRate: number; // % (0..100)
  mrr: Money; // shu oy oxiridagi MRR (joriy oylik summalar bo'yicha taxminiy)
};

export type FinanceOverview = {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  mrr: Money;
  // Joriy oy
  newThisMonth: number;
  lostThisMonth: number;
  churnRate: number; // %
  // Qarzdorlik (muddati o'tgan faol mijozlar) — yoshi bo'yicha
  overdueCount: number;
  overdueSum: Money;
  aging: AgingBucket[];
  // Oxirgi N oy dinamikasi (eskidan yangiga)
  months: MonthPoint[];
};

const UZBEK_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

/** Kun boshiga tenglashtirilgan bugungi sana. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Moliyaviy panel uchun barcha ko'rsatkich — bitta mijozlar so'rovidan.
 * @param monthsBack necha oy dinamikasi (default 12).
 */
export async function getFinanceOverview(monthsBack = 12): Promise<FinanceOverview> {
  const clients = await db.client.findMany({
    select: {
      status: true,
      stage: true,
      currency: true,
      monthlyAmount: true,
      nextPaymentDate: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  const now = new Date();
  const today = startOfToday();

  // --- Joriy holat ---
  const mrr = emptyMoney();
  let activeClients = 0;
  let inactiveClients = 0;
  for (const c of clients) {
    if (isChurned(c)) inactiveClients += 1;
    if (isMrrActive(c)) {
      activeClients += 1;
      addMoney(mrr, c.currency, c.monthlyAmount);
    }
  }

  // --- Qarzdorlik yoshi (muddati o'tgan faol mijozlar) ---
  const buckets: Record<AgingBucket["key"], AgingBucket> = {
    b30: { key: "b30", label: "1–30 kun", count: 0, sum: emptyMoney() },
    b60: { key: "b60", label: "31–60 kun", count: 0, sum: emptyMoney() },
    b90: { key: "b90", label: "61–90 kun", count: 0, sum: emptyMoney() },
    b90plus: { key: "b90plus", label: "90+ kun", count: 0, sum: emptyMoney() },
  };
  let overdueCount = 0;
  const overdueSum = emptyMoney();
  for (const c of clients) {
    if (isChurned(c) || !c.nextPaymentDate) continue;
    const due = new Date(c.nextPaymentDate);
    due.setHours(0, 0, 0, 0);
    const overdueDays = daysBetween(due, today);
    if (overdueDays <= 0) continue; // muddati o'tmagan
    overdueCount += 1;
    addMoney(overdueSum, c.currency, c.monthlyAmount);
    const b =
      overdueDays <= 30 ? buckets.b30
      : overdueDays <= 60 ? buckets.b60
      : overdueDays <= 90 ? buckets.b90
      : buckets.b90plus;
    b.count += 1;
    addMoney(b.sum, c.currency, c.monthlyAmount);
  }

  // --- Oylik dinamika (yangi / yo'qotilgan / churn / MRR trend) ---
  const months: MonthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const from = startOfMonth(monthDate);
    const to = endOfMonth(monthDate);

    let newCount = 0;
    let lostCount = 0;
    let activeAtStart = 0;
    const monthMrr = emptyMoney();

    for (const c of clients) {
      const created = c.createdAt;
      const deact = c.deactivatedAt;

      if (created >= from && created <= to) newCount += 1;
      if (deact && deact >= from && deact <= to) lostCount += 1;

      // Oy boshida faol edimi (churn undan keyin bo'lgan yoki umuman bo'lmagan)
      if (created < from && (!deact || deact >= from)) activeAtStart += 1;

      // Oy oxiridagi MRR — o'sha vaqtda mavjud (yaratilgan, hali churn bo'lmagan)
      // va oyligi bor mijozlar. Tarixiy summalar saqlanmagani uchun joriy
      // `monthlyAmount` bilan taxminiy hisoblanadi.
      if (created <= to && (!deact || deact > to) && c.monthlyAmount > 0) {
        addMoney(monthMrr, c.currency, c.monthlyAmount);
      }
    }

    const churnRate = activeAtStart > 0 ? (lostCount / activeAtStart) * 100 : 0;
    months.push({
      key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`,
      label: UZBEK_MONTHS[from.getMonth()],
      newCount,
      lostCount,
      churnRate: Math.round(churnRate * 10) / 10,
      mrr: monthMrr,
    });
  }

  const current = months[months.length - 1];

  return {
    totalClients: clients.length,
    activeClients,
    inactiveClients,
    mrr,
    newThisMonth: current?.newCount ?? 0,
    lostThisMonth: current?.lostCount ?? 0,
    churnRate: current?.churnRate ?? 0,
    overdueCount,
    overdueSum,
    aging: [buckets.b30, buckets.b60, buckets.b90, buckets.b90plus],
    months,
  };
}

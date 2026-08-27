// "Muammoli mijozlar" bo'limining ma'lumot manbai.
//
// Bo'lim uch xil muammoni bir joyga yig'adi — ilgari ular uch joyga sochilib
// ketgan edi (/toldirilmagan, /uskuna-analitika ichidagi 29$ bloki va
// /mijozlar/dublikatlar), shu sabab hech kim ularni birgalikda ko'rmasdi:
//
//   1. ma'lumot     — telefon/restoran nomi/viloyat to'ldirilmagan
//   2. to'lov/ijara — oylik summa bilan biriktirilgan ijara uskunasi mos emas
//   3. dublikat     — bitta restoran bir necha marta yozilgan
//
// Bu yerda faqat O'QISH bor: hech narsa o'zgartirilmaydi, tuzatish mavjud
// sahifalardagi amallar (quick-complete, tahrir, dublikat o'chirish) orqali.

import { Prisma } from "@prisma/client";
import { db } from "./db";
import { check29Rule, type RuleCheck } from "./inventory-stats";

/**
 * "Ma'lumoti to'liq emas" ta'rifi — YAGONA joyda.
 *
 * "—" ham to'ldirilmagan hisoblanadi: import paytida bo'sh restoran nomi o'rniga
 * shu joy egasi qo'yilgan. Ro'yxat dinamik — maydon to'ldirilgach mijoz
 * o'zi chiqib ketadi.
 */
export const INCOMPLETE_WHERE: Prisma.ClientWhereInput = {
  OR: [
    { phone: "" },
    { restaurantName: "" },
    { restaurantName: "—" },
    { region: null },
    { region: "" },
  ],
};

export type IncompleteClient = {
  id: string;
  fullName: string;
  restaurantName: string;
  phone: string;
  region: string | null;
  contractNumber: string | null;
};

export async function loadIncompleteClients(): Promise<IncompleteClient[]> {
  return db.client.findMany({
    where: INCOMPLETE_WHERE,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      restaurantName: true,
      fullName: true,
      phone: true,
      region: true,
      contractNumber: true,
    },
  });
}

/** 29$ qoidasi ro'yxatlarida ko'rsatiladigan mijoz. */
export type PaymentRuleClient = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  monthlyAmount: number;
  currency: string;
  rentedQty: number;
  soldQty: number;
  assignedToName: string | null;
};

/** Mijoz bo'yicha ijara/sotib olingan uskuna sonini yig'adi — sof, test qilinadi. */
export function buildEquipmentQtyMaps(
  equipment: { clientId: string; quantity: number; ownership: string }[],
): { rented: Map<string, number>; soldQty: Map<string, number> } {
  const rented = new Map<string, number>();
  const soldQty = new Map<string, number>();
  for (const e of equipment) {
    const target = e.ownership === "RENTAL" ? rented : soldQty;
    target.set(e.clientId, (target.get(e.clientId) ?? 0) + e.quantity);
  }
  return { rented, soldQty };
}

/**
 * To'lov/ijara nomuvofiqligi — faqat FAOL mijozlar bo'yicha.
 *
 * Otkaz/nofaol mijoz uskunasini qaytargan bo'lishi mumkin, oyligi esa tarixiy
 * qiymat bo'lib qoladi — ularni tekshirish soxta ogohlantirish beradi.
 */
export async function loadPaymentProblems(): Promise<RuleCheck<PaymentRuleClient>> {
  const [clients, equipment] = await Promise.all([
    db.client.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        restaurantName: true,
        fullName: true,
        phone: true,
        monthlyAmount: true,
        currency: true,
        assignedTo: { select: { name: true } },
      },
    }),
    db.clientEquipment.findMany({
      select: { clientId: true, quantity: true, ownership: true },
    }),
  ]);

  const { rented, soldQty } = buildEquipmentQtyMaps(equipment);

  return check29Rule(
    clients.map((c) => ({
      id: c.id,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      phone: c.phone,
      monthlyAmount: c.monthlyAmount,
      currency: c.currency,
      rentedQty: rented.get(c.id) ?? 0,
      soldQty: soldQty.get(c.id) ?? 0,
      assignedToName: c.assignedTo?.name ?? null,
    })),
  );
}

// Tab satridagi sonlar ataylab shu yerda hisoblanmaydi: sahifa uchala ro'yxatni
// baribir to'liq yuklaydi, alohida COUNT so'rovlari faqat ikkinchi marta o'sha
// ishni qilardi. Nav badge'iga ham qo'yilmagan — bu hisob har sahifa ochilishida
// butun mijoz + uskuna jadvalini o'qiydi, badge uchun juda qimmat.

/**
 * Otkaz qilingan, lekin holati hali "Faol" bo'lgan mijozlar.
 *
 * NEGA BO'LADI: ilovaning o'z yo'llari (`refuseClient`, lid natijasi) otkazda
 * `status: "INACTIVE"` ni ham qo'yadi. Bu yozuvlar ESKI IMPORTLARDAN qolgan —
 * sheet rangi/izohi bo'yicha `stage` qo'yilgan, `status` esa tegilmagan
 * (bir marta `scripts/fix-refused-status.ts` bilan tuzatilgan, keyingi import
 * yana keltirgan).
 *
 * NEGA MUHIM: `status` — moliyaning kaliti. Otkaz mijoz "Faol" bo'lib tursa,
 * uning oyligi MRR ga qo'shilib, daromad oshirib ko'rsatiladi; 29$ qoidasi va
 * uskuna hisoblari ham uni tekshiradi. Ayni paytda `/mijozlar` ro'yxatida
 * ko'rinmaydi (u yerda otkazlar yashiriladi) — shu sabab bir xil narsani
 * sanaydigan ikki joy har xil son ko'rsatadi.
 */
export async function loadRefusedButActive(): Promise<{
  clients: {
    id: string;
    restaurantName: string;
    fullName: string;
    phone: string;
    monthlyAmount: number;
    currency: string;
  }[];
  /** Valyuta bo'yicha oylik summa — tuzatilgach MRR shuncha kamayadi. */
  mrr: Record<string, number>;
}> {
  const clients = await db.client.findMany({
    where: { stage: "REFUSED", status: { not: "INACTIVE" } },
    orderBy: { monthlyAmount: "desc" },
    select: {
      id: true,
      restaurantName: true,
      fullName: true,
      phone: true,
      monthlyAmount: true,
      currency: true,
    },
  });
  return { clients, mrr: sumMrrByCurrency(clients) };
}

/** Mijozlar ro'yxatini valyuta bo'yicha oylik summaga yig'adi — sof, test qilinadi. */
export function sumMrrByCurrency(clients: { currency: string; monthlyAmount: number }[]): Record<string, number> {
  const mrr: Record<string, number> = {};
  for (const c of clients) {
    mrr[c.currency] = (mrr[c.currency] ?? 0) + c.monthlyAmount;
  }
  return mrr;
}

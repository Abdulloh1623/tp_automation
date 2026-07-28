// "Jim churn" — Biznex'da obunasi TUGAGAN yoki o'chirilgan, lekin CRM'da hali
// faol turgan mijozlar. Ular aslida mahsulotdan foydalanmayapti, lekin MRR'da
// sanaladi va hech qayerda ko'rinmaydi — shu sabab alohida signal kerak.
//
// Manba: `Client.biznexStatus` — fon skripti (`npm run sync-biznex`) qo'yadi.
// `NOT_FOUND` bu yerga KIRMAYDI: u "telefon bo'yicha moslik topilmadi" degani
// (ma'lumot sifati muammosi), obuna tugagani emas — uning o'z filtri bor.

import { db } from "./db";
import { NO_CONTACT_STAGES } from "./constants";
import { emptyMoney, type Money } from "./finance";

export const SILENT_CHURN_STATUSES = ["EXPIRED", "INACTIVE"] as const;

export type SilentChurnClient = {
  id: string;
  restaurantName: string;
  phone: string;
  region: string | null;
  monthlyAmount: number;
  currency: string;
  biznexStatus: string | null;
  biznexCheckedAt: Date | null;
  operatorName: string | null;
};

export type SilentChurnSummary = {
  count: number;
  /** Xavf ostidagi MRR — hali "faol" deb sanalayotgan oylik summalar. */
  atRisk: Money;
  clients: SilentChurnClient[];
};

/**
 * Jim churn ro'yxati. `limit` — qaytariladigan mijozlar soni (`count` va
 * `atRisk` har doim TO'LIQ to'plam bo'yicha hisoblanadi, kesilgan ro'yxat
 * bo'yicha emas — aks holda summa yolg'on chiqardi).
 */
export async function getSilentChurn(limit?: number): Promise<SilentChurnSummary> {
  const rows = await db.client.findMany({
    where: {
      status: "ACTIVE",
      // Otkaz/o'chirilganlar allaqachon churn deb hisoblangan — takrorlamaymiz.
      stage: { notIn: [...NO_CONTACT_STAGES] },
      biznexStatus: { in: [...SILENT_CHURN_STATUSES] },
    },
    orderBy: [{ monthlyAmount: "desc" }, { restaurantName: "asc" }],
    select: {
      id: true,
      restaurantName: true,
      phone: true,
      region: true,
      monthlyAmount: true,
      currency: true,
      biznexStatus: true,
      biznexCheckedAt: true,
      assignedTo: { select: { name: true } },
    },
  });

  const atRisk = emptyMoney();
  for (const c of rows) {
    atRisk[c.currency === "UZS" ? "UZS" : "USD"] += c.monthlyAmount;
  }

  const clients = (limit ? rows.slice(0, limit) : rows).map((c) => ({
    id: c.id,
    restaurantName: c.restaurantName,
    phone: c.phone,
    region: c.region,
    monthlyAmount: c.monthlyAmount,
    currency: c.currency,
    biznexStatus: c.biznexStatus,
    biznexCheckedAt: c.biznexCheckedAt,
    operatorName: c.assignedTo?.name ?? null,
  }));

  return { count: rows.length, atRisk, clients };
}

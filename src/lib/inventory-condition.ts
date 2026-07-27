// Ustadagi uskunani "yangi" va "ishlatilgan" ga ajratish.
//
// Sxemada bunday maydon YO'Q (InventoryStock faqat miqdorni biladi), lekin
// buni harakatlar jurnalidan (EquipmentMovement) hisoblash mumkin:
//
//   ombordan ustaga kelgan   → YANGI      (hali o'rnatilmagan zaxira)
//   mijozdan ustaga kelgan   → ISHLATILGAN (qaytarib olingan uskuna)
//   ustadan mijozga ketgan   → yangisidan ayiriladi (o'rnatishga yangisi ketadi)
//   ustadan omborga/brakka   → ishlatilganidan ayiriladi (qaytarib topshirdi)
//
// Farq qolsa — "aniqlanmagan" ustunida ko'rsatiladi (jurnaldan oldingi tarixiy
// qoldiq yoki yuqoridagi taxminga to'g'ri kelmagan harakat). Uni yashirmaymiz:
// noto'g'ri "yangi/ishlatilgan" ko'rsatgandan ko'ra ochiq aytgan ma'qul.

export const WAREHOUSE_LOC = "WAREHOUSE";

export type MovementAgg = {
  fromType: string | null;
  fromId: string | null;
  toType: string | null;
  toId: string | null;
  equipmentTypeId: string;
  quantity: number;
};

export type StockRow = {
  locationId: string; // usta id
  equipmentTypeId: string;
  quantity: number;
};

export type ConditionSplit = {
  total: number;
  /** Ombordan olingan, hali o'rnatilmagan */
  fresh: number;
  /** Mijozdan qaytarib olingan */
  used: number;
  /** Jurnaldan aniqlab bo'lmagan qoldiq */
  unknown: number;
};

const key = (ustaId: string, typeId: string) => `${ustaId}|${typeId}`;

/**
 * Har bir (usta, uskuna turi) juftligi uchun yangi/ishlatilgan taqsimotini
 * qaytaradi. Yakuniy `total` HAR DOIM haqiqiy qoldiqqa (InventoryStock) teng —
 * jurnal to'liq bo'lmasa farq `unknown` ga tushadi.
 */
export function splitUstaStockByCondition(
  stock: StockRow[],
  movements: MovementAgg[],
): Map<string, ConditionSplit> {
  const fresh = new Map<string, number>();
  const used = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  for (const mv of movements) {
    const qty = mv.quantity;
    if (qty <= 0) continue;

    // Ustaga KIRIM
    if (mv.toType === "USTA" && mv.toId) {
      const k = key(mv.toId, mv.equipmentTypeId);
      if (mv.fromType === "CLIENT") add(used, k, qty);
      else add(fresh, k, qty); // ombor yoki boshqa manba — yangi zaxira
    }

    // Ustadan CHIQIM
    if (mv.fromType === "USTA" && mv.fromId) {
      const k = key(mv.fromId, mv.equipmentTypeId);
      // Mijozga o'rnatishga yangisi ketadi; omborga/brakka esa ishlatilgani
      // qaytariladi. Manba yetmasa ikkinchisidan ayiriladi (pastda tenglashtirish).
      if (mv.toType === "CLIENT") add(fresh, k, -qty);
      else add(used, k, -qty);
    }
  }

  const out = new Map<string, ConditionSplit>();
  for (const row of stock) {
    const k = key(row.locationId, row.equipmentTypeId);
    let f = Math.max(0, fresh.get(k) ?? 0);
    let u = Math.max(0, used.get(k) ?? 0);
    const total = row.quantity;

    // Hisob qoldiqdan OSHIB ketgan bo'lsa — kamaytiramiz (avval ishlatilgani).
    let over = f + u - total;
    if (over > 0) {
      const cutUsed = Math.min(u, over);
      u -= cutUsed;
      over -= cutUsed;
      f = Math.max(0, f - over);
    }

    out.set(k, { total, fresh: f, used: u, unknown: Math.max(0, total - f - u) });
  }
  return out;
}

/** Bir nechta turdagi taqsimotni bitta jamiga qo'shadi (usta bo'yicha yakun). */
export function sumSplits(splits: ConditionSplit[]): ConditionSplit {
  return splits.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      fresh: acc.fresh + s.fresh,
      used: acc.used + s.used,
      unknown: acc.unknown + s.unknown,
    }),
    { total: 0, fresh: 0, used: 0, unknown: 0 },
  );
}

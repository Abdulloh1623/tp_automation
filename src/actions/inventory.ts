"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type InvState = { ok: boolean; error?: string };

const WAREHOUSE = "WAREHOUSE";

async function requireManager(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  return { ok: true, userId: session.userId };
}

/** Joylashuvdagi miqdorni o'zgartiradi (upsert). */
async function adjustStock(
  locationType: string,
  locationId: string,
  equipmentTypeId: string,
  delta: number,
) {
  const existing = await db.inventoryStock.findUnique({
    where: {
      locationType_locationId_equipmentTypeId: {
        locationType,
        locationId,
        equipmentTypeId,
      },
    },
  });
  if (existing) {
    await db.inventoryStock.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + delta },
    });
  } else {
    await db.inventoryStock.create({
      data: { locationType, locationId, equipmentTypeId, quantity: delta },
    });
  }
}

async function warehouseQty(equipmentTypeId: string): Promise<number> {
  const s = await db.inventoryStock.findUnique({
    where: {
      locationType_locationId_equipmentTypeId: {
        locationType: WAREHOUSE,
        locationId: WAREHOUSE,
        equipmentTypeId,
      },
    },
  });
  return s?.quantity ?? 0;
}

/** Omborga kirim. */
export async function addStock(
  equipmentTypeId: string,
  quantity: number,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!quantity || quantity <= 0) return { ok: false, error: "Miqdor noto'g'ri" };

  const type = await db.equipmentType.findUnique({ where: { id: equipmentTypeId } });
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };

  await adjustStock(WAREHOUSE, WAREHOUSE, equipmentTypeId, quantity);
  await db.equipmentMovement.create({
    data: {
      equipmentTypeId,
      quantity,
      toType: WAREHOUSE,
      toId: WAREHOUSE,
      reason: "Kirim",
      byUserId: m.userId,
    },
  });
  await logAudit("Omborga kirim", {
    entity: "Equipment",
    detail: `${type.name} +${quantity}`,
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/** Ombor → Usta taqsimot. */
export async function transferToUsta(
  equipmentTypeId: string,
  ustaId: string,
  quantity: number,
  note: string,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!quantity || quantity <= 0) return { ok: false, error: "Miqdor noto'g'ri" };
  if (!note || !note.trim()) return { ok: false, error: "Izoh majburiy" };

  const [type, usta] = await Promise.all([
    db.equipmentType.findUnique({ where: { id: equipmentTypeId } }),
    db.user.findUnique({ where: { id: ustaId } }),
  ]);
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };
  if (!usta || usta.role !== "INSTALLER") return { ok: false, error: "Usta topilmadi" };

  const available = await warehouseQty(equipmentTypeId);
  if (available < quantity) {
    return { ok: false, error: `Omborda yetarli emas (mavjud: ${available})` };
  }

  await adjustStock(WAREHOUSE, WAREHOUSE, equipmentTypeId, -quantity);
  await adjustStock("USTA", ustaId, equipmentTypeId, quantity);
  await db.equipmentMovement.create({
    data: {
      equipmentTypeId,
      quantity,
      fromType: WAREHOUSE,
      fromId: WAREHOUSE,
      toType: "USTA",
      toId: ustaId,
      reason: "Ustaga taqsimot",
      note: note.trim(),
      byUserId: m.userId,
    },
  });
  await logAudit("Ustaga texnika berildi", {
    entity: "Equipment",
    detail: `${type.name} ${quantity} → ${usta.name}`,
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/** Yangi texnika turi qo'shish. */
export async function createEquipmentType(input: {
  name: string;
  rentalPrice: number;
  salePrice: number;
  minStock: number;
}): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Nom kiriting" };
  if (input.rentalPrice < 0 || input.salePrice < 0 || input.minStock < 0) {
    return { ok: false, error: "Qiymat noto'g'ri" };
  }
  const exists = await db.equipmentType.findUnique({ where: { name } });
  if (exists) return { ok: false, error: "Bu nomli tur allaqachon bor" };

  await db.equipmentType.create({
    data: {
      name,
      rentalPrice: input.rentalPrice,
      salePrice: input.salePrice,
      minStock: input.minStock,
    },
  });
  await logAudit("Texnika turi qo'shildi", { entity: "Equipment", detail: name });
  revalidatePath("/ombor");
  return { ok: true };
}

/** Texnika turini tahrirlash (faqat berilgan maydonlar). */
export async function updateEquipmentType(
  equipmentTypeId: string,
  data: { name?: string; rentalPrice?: number; salePrice?: number; minStock?: number },
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  const patch: { name?: string; rentalPrice?: number; salePrice?: number; minStock?: number } = {};
  if (data.name !== undefined) {
    const n = data.name.trim();
    if (!n) return { ok: false, error: "Nom bo'sh bo'lmasin" };
    const dup = await db.equipmentType.findFirst({
      where: { name: n, NOT: { id: equipmentTypeId } },
    });
    if (dup) return { ok: false, error: "Bu nom band" };
    patch.name = n;
  }
  if (data.rentalPrice !== undefined) {
    if (data.rentalPrice < 0) return { ok: false, error: "Narx noto'g'ri" };
    patch.rentalPrice = data.rentalPrice;
  }
  if (data.salePrice !== undefined) {
    if (data.salePrice < 0) return { ok: false, error: "Narx noto'g'ri" };
    patch.salePrice = data.salePrice;
  }
  if (data.minStock !== undefined) {
    if (data.minStock < 0) return { ok: false, error: "Qiymat noto'g'ri" };
    patch.minStock = data.minStock;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const type = await db.equipmentType.update({ where: { id: equipmentTypeId }, data: patch });
  await logAudit("Texnika turi tahrirlandi", { entity: "Equipment", detail: type.name });
  revalidatePath("/ombor");
  return { ok: true };
}

/** Texnika turini faollashtirish/faolsizlantirish. */
export async function setEquipmentTypeActive(
  equipmentTypeId: string,
  active: boolean,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  const type = await db.equipmentType.update({
    where: { id: equipmentTypeId },
    data: { isActive: active },
  });
  await logAudit(active ? "Texnika turi yoqildi" : "Texnika turi faolsizlantirildi", {
    entity: "Equipment",
    detail: type.name,
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/** Texnikani brakka chiqarish (ombor yoki usta zaxirasidan). Izoh majburiy. */
export async function scrapToBrak(
  equipmentTypeId: string,
  fromType: string,
  fromId: string,
  quantity: number,
  note: string,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!quantity || quantity <= 0) return { ok: false, error: "Miqdor noto'g'ri" };
  if (!note || !note.trim()) return { ok: false, error: "Izoh majburiy" };
  if (!["WAREHOUSE", "USTA"].includes(fromType)) {
    return { ok: false, error: "Manba noto'g'ri" };
  }

  const fromLocId = fromType === "WAREHOUSE" ? WAREHOUSE : fromId;
  const src = await db.inventoryStock.findUnique({
    where: {
      locationType_locationId_equipmentTypeId: {
        locationType: fromType,
        locationId: fromLocId,
        equipmentTypeId,
      },
    },
  });
  if (!src || src.quantity < quantity) {
    return { ok: false, error: `Yetarli emas (mavjud: ${src?.quantity ?? 0})` };
  }

  await adjustStock(fromType, fromLocId, equipmentTypeId, -quantity);
  await adjustStock("BRAK", "BRAK", equipmentTypeId, quantity);
  await db.equipmentMovement.create({
    data: {
      equipmentTypeId,
      quantity,
      fromType,
      fromId: fromLocId,
      toType: "BRAK",
      toId: "BRAK",
      reason: "Brak",
      note: note.trim(),
      byUserId: m.userId,
    },
  });
  await logAudit("Brakka chiqarildi", {
    entity: "Equipment",
    detail: note.trim(),
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/** Usta zaxirasidan omborga qaytarish (ishlatilmagan texnika). */
export async function returnFromUsta(
  equipmentTypeId: string,
  ustaId: string,
  quantity: number,
  note?: string,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!quantity || quantity <= 0) return { ok: false, error: "Miqdor noto'g'ri" };

  const [type, usta] = await Promise.all([
    db.equipmentType.findUnique({ where: { id: equipmentTypeId } }),
    db.user.findUnique({ where: { id: ustaId } }),
  ]);
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };
  if (!usta) return { ok: false, error: "Usta topilmadi" };

  const src = await db.inventoryStock.findUnique({
    where: {
      locationType_locationId_equipmentTypeId: {
        locationType: "USTA",
        locationId: ustaId,
        equipmentTypeId,
      },
    },
  });
  if (!src || src.quantity < quantity) {
    return { ok: false, error: `Ustada yetarli emas (mavjud: ${src?.quantity ?? 0})` };
  }

  await adjustStock("USTA", ustaId, equipmentTypeId, -quantity);
  await adjustStock(WAREHOUSE, WAREHOUSE, equipmentTypeId, quantity);
  await db.equipmentMovement.create({
    data: {
      equipmentTypeId,
      quantity,
      fromType: "USTA",
      fromId: ustaId,
      toType: WAREHOUSE,
      toId: WAREHOUSE,
      reason: "Ustadan qaytarish",
      note: note && note.trim() ? note.trim() : null,
      byUserId: m.userId,
    },
  });
  await logAudit("Ustadan ombor qaytarildi", {
    entity: "Equipment",
    detail: `${type.name} ${quantity} ← ${usta.name}`,
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/** Inventarizatsiya: ombordagi haqiqiy sanoqni kiritish; farq jurnalga yoziladi. */
export async function adjustInventory(
  equipmentTypeId: string,
  actualQty: number,
  note?: string,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (actualQty < 0 || !Number.isFinite(actualQty)) {
    return { ok: false, error: "Sanoq noto'g'ri" };
  }
  const type = await db.equipmentType.findUnique({ where: { id: equipmentTypeId } });
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };

  const current = await warehouseQty(equipmentTypeId);
  const delta = actualQty - current;
  if (delta === 0) return { ok: true };

  await adjustStock(WAREHOUSE, WAREHOUSE, equipmentTypeId, delta);
  await db.equipmentMovement.create({
    data: {
      equipmentTypeId,
      quantity: Math.abs(delta),
      ...(delta > 0
        ? { toType: WAREHOUSE, toId: WAREHOUSE }
        : { fromType: WAREHOUSE, fromId: WAREHOUSE }),
      reason: "Inventarizatsiya",
      note: `${current} → ${actualQty}${note && note.trim() ? " · " + note.trim() : ""}`,
      byUserId: m.userId,
    },
  });
  await logAudit("Inventarizatsiya (sanoq)", {
    entity: "Equipment",
    detail: `${type.name}: ${current} → ${actualQty}`,
  });
  revalidatePath("/ombor");
  return { ok: true };
}

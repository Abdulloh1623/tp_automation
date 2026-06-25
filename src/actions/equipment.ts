"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseRegions } from "@/lib/constants";

export type EqState = { ok: boolean; error?: string };

const WAREHOUSE = "WAREHOUSE";

async function requireManager() {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false as const, error: "Ruxsat yo'q" };
  }
  return { ok: true as const, userId: session.userId };
}

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

/** Mijozda qolgan uskunalarga qarab equipmentMode'ni qayta hisoblaydi. */
async function recomputeMode(clientId: string) {
  const items = await db.clientEquipment.findMany({
    where: { clientId, quantity: { gt: 0 } },
    select: { ownership: true },
  });
  const mode = items.some((i) => i.ownership === "RENTAL")
    ? "RENTAL"
    : items.some((i) => i.ownership === "SOLD")
      ? "SOLD"
      : "PROGRAM_ONLY";
  await db.client.update({ where: { id: clientId }, data: { equipmentMode: mode } });
}

/** Manager: mijozga ombordan uskuna biriktiradi (ijara yoki sotuv). */
export async function assignEquipmentToClient(
  clientId: string,
  equipmentTypeId: string,
  ownership: string,
  quantity: number,
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!quantity || quantity <= 0) return { ok: false, error: "Miqdor noto'g'ri" };
  if (!["RENTAL", "SOLD"].includes(ownership)) {
    return { ok: false, error: "Egalik turi noto'g'ri" };
  }

  const [type, client] = await Promise.all([
    db.equipmentType.findUnique({ where: { id: equipmentTypeId } }),
    db.client.findUnique({ where: { id: clientId } }),
  ]);
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const available = await warehouseQty(equipmentTypeId);
  if (available < quantity) {
    return { ok: false, error: `Omborda yetarli emas (mavjud: ${available})` };
  }

  await adjustStock(WAREHOUSE, WAREHOUSE, equipmentTypeId, -quantity);

  const existing = await db.clientEquipment.findUnique({
    where: {
      clientId_equipmentTypeId_ownership: { clientId, equipmentTypeId, ownership },
    },
  });
  if (existing) {
    await db.clientEquipment.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
    });
  } else {
    await db.clientEquipment.create({
      data: { clientId, equipmentTypeId, ownership, quantity },
    });
  }

  await db.equipmentMovement.create({
    data: {
      equipmentTypeId,
      quantity,
      fromType: WAREHOUSE,
      fromId: WAREHOUSE,
      toType: "CLIENT",
      toId: clientId,
      reason: ownership === "RENTAL" ? "Mijozga ijara" : "Mijozga sotuv",
      byUserId: m.userId,
    },
  });

  // Sotuv — bir martalik to'lov yoziladi
  if (ownership === "SOLD") {
    await db.payment.create({
      data: {
        clientId,
        amount: type.salePrice * quantity,
        currency: client.currency,
        receiptNote: `Uskuna sotuvi: ${type.name} ×${quantity}`,
        recordedById: m.userId,
      },
    });
  }

  await recomputeMode(clientId);

  await logAudit("Mijozga uskuna biriktirildi", {
    entity: "Client",
    entityId: clientId,
    detail: `${type.name} ×${quantity} (${ownership === "RENTAL" ? "ijara" : "sotuv"})`,
  });
  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/ombor");
  return { ok: true };
}

/** Operator/manager: mijoz bilan gaplashib uskunani qaytarish arizasini yaratadi. */
export async function requestEquipmentReturn(
  clientId: string,
  note: string,
): Promise<EqState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  if (!note || !note.trim()) return { ok: false, error: "Izoh majburiy" };

  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { equipmentItems: true },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const rentalItems = client.equipmentItems.filter(
    (i) => i.ownership === "RENTAL" && i.quantity > 0,
  );
  if (rentalItems.length === 0) {
    return { ok: false, error: "Mijozda qaytariladigan ijara uskunasi yo'q" };
  }

  const open = await db.equipmentReturnRequest.findFirst({
    where: { clientId, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (open) {
    return { ok: false, error: "Bu mijoz uchun ochiq qaytarish arizasi mavjud" };
  }

  await db.equipmentReturnRequest.create({
    data: { clientId, byUserId: session.userId, note: note.trim(), status: "PENDING" },
  });
  await logAudit("Uskuna qaytarish arizasi", {
    entity: "Client",
    entityId: clientId,
    detail: client.restaurantName,
  });
  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/qaytarish");
  return { ok: true };
}

/**
 * Boshliq: qaytarish arizasiga usta biriktiradi. `chosenUstaId` berilsa — o'sha usta;
 * berilmasa — mijoz viloyatiga ko'ra avtomatik tanlanadi.
 */
export async function approveReturnRequest(
  requestId: string,
  chosenUstaId?: string,
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;

  const req = await db.equipmentReturnRequest.findUnique({
    where: { id: requestId },
    include: { client: true },
  });
  if (!req || req.status !== "PENDING") {
    return { ok: false, error: "Ariza topilmadi yoki holati o'zgargan" };
  }

  let usta: { id: string; name: string } | null = null;
  if (chosenUstaId) {
    usta = await db.user.findFirst({
      where: { id: chosenUstaId, role: "INSTALLER", isActive: true },
      select: { id: true, name: true },
    });
    if (!usta) return { ok: false, error: "Tanlangan usta topilmadi" };
  } else {
    const region = req.client.region;
    if (!region) {
      return { ok: false, error: "Mijoz viloyati yo'q — ustani qo'lda tanlang" };
    }
    const candidates = await db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, region: true, regions: true },
    });
    const match = candidates.find((u) =>
      parseRegions(u.regions, u.region).includes(region),
    );
    if (!match) {
      return { ok: false, error: `"${region}" viloyatida faol usta yo'q — qo'lda tanlang.` };
    }
    usta = { id: match.id, name: match.name };
  }

  await db.equipmentReturnRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", ustaId: usta.id },
  });
  await db.client.update({
    where: { id: req.clientId },
    data: { assignedUstaId: usta.id, ustaStatus: "ASSIGNED" },
  });
  await logAudit("Qaytarish: usta biriktirildi", {
    entity: "Client",
    entityId: req.clientId,
    detail: `${req.client.restaurantName} → ${usta.name}`,
  });
  revalidatePath("/qaytarish");
  revalidatePath(`/mijozlar/${req.clientId}`);
  return { ok: true };
}

/** Manager: qaytarish arizasini rad etadi. */
export async function rejectReturnRequest(
  requestId: string,
  note?: string,
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;

  const req = await db.equipmentReturnRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") {
    return { ok: false, error: "Ariza topilmadi yoki holati o'zgargan" };
  }
  await db.equipmentReturnRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      resolvedAt: new Date(),
      note: note && note.trim() ? note.trim() : req.note,
    },
  });
  await logAudit("Qaytarish rad etildi", { entity: "Client", entityId: req.clientId });
  revalidatePath("/qaytarish");
  return { ok: true };
}

/** Usta: mijozdan uskunani olib keldi — ijara uskunalari usta zaxirasiga o'tadi. */
export async function confirmReturnCollected(requestId: string): Promise<EqState> {
  const session = await requireSession();
  const req = await db.equipmentReturnRequest.findUnique({
    where: { id: requestId },
    include: { client: { include: { equipmentItems: true } } },
  });
  if (!req || req.status !== "APPROVED") {
    return { ok: false, error: "Ariza topilmadi yoki holati o'zgargan" };
  }
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);
  if (!isManager && req.ustaId !== session.userId) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  const ustaId = req.ustaId;
  if (!ustaId) return { ok: false, error: "Usta biriktirilmagan" };

  const rentalItems = req.client.equipmentItems.filter(
    (i) => i.ownership === "RENTAL" && i.quantity > 0,
  );

  for (const item of rentalItems) {
    await adjustStock("USTA", ustaId, item.equipmentTypeId, item.quantity);
    await db.equipmentMovement.create({
      data: {
        equipmentTypeId: item.equipmentTypeId,
        quantity: item.quantity,
        fromType: "CLIENT",
        fromId: req.clientId,
        toType: "USTA",
        toId: ustaId,
        reason: "Uskuna qaytarildi (mijozdan)",
        byUserId: session.userId,
      },
    });
    await db.clientEquipment.delete({ where: { id: item.id } });
  }

  await db.equipmentReturnRequest.update({
    where: { id: requestId },
    data: { status: "DONE", resolvedAt: new Date() },
  });
  await db.client.update({
    where: { id: req.clientId },
    data: { ustaStatus: "DONE" },
  });
  await recomputeMode(req.clientId);

  await logAudit("Uskuna qaytarib olindi", {
    entity: "Client",
    entityId: req.clientId,
    detail: req.client.restaurantName,
  });
  revalidatePath("/qaytarish");
  revalidatePath("/ombor");
  revalidatePath(`/mijozlar/${req.clientId}`);
  return { ok: true };
}

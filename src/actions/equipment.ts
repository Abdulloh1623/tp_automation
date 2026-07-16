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

/** Uskuna qayerdan olinadi — ombor (Toshkent) yoki ustaning zaxirasi. */
export type EquipmentSource =
  | { type: "WAREHOUSE" }
  | { type: "USTA"; ustaId: string };

/**
 * Manager: mijozga uskuna biriktiradi (ijara yoki sotuv). Uskuna MANBAdan
 * (ombor yoki usta zaxirasi) ayiriladi — usta o'zi olib borgan uskunani
 * o'rnatsa usta zaxirasidan, Toshkentda ombordan olib ketilsa ombordan.
 * Barcha yozuvlar bitta tranzaksiyada (qoldiq yetmasa — hech nima yozilmaydi).
 * Sotuvda salePrice bo'yicha bir martalik to'lov (Payment) yoziladi.
 */
export async function assignEquipmentToClient(
  clientId: string,
  equipmentTypeId: string,
  ownership: string,
  quantity: number,
  source: EquipmentSource = { type: "WAREHOUSE" },
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!quantity || quantity <= 0) return { ok: false, error: "Miqdor noto'g'ri" };
  if (!["RENTAL", "SOLD"].includes(ownership)) {
    return { ok: false, error: "Egalik turi noto'g'ri" };
  }

  const srcType = source.type === "USTA" ? "USTA" : WAREHOUSE;
  const srcId = source.type === "USTA" ? source.ustaId : WAREHOUSE;
  if (srcType === "USTA" && !srcId) return { ok: false, error: "Usta tanlanmagan" };

  const [type, client] = await Promise.all([
    db.equipmentType.findUnique({ where: { id: equipmentTypeId } }),
    db.client.findUnique({ where: { id: clientId } }),
  ]);
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  // Manba usta bo'lsa — haqiqiy usta ekanini tekshiramiz (nomi izohga yoziladi).
  let ustaName: string | null = null;
  if (srcType === "USTA") {
    const u = await db.user.findUnique({
      where: { id: srcId },
      select: { name: true, role: true },
    });
    if (!u || u.role !== "INSTALLER") return { ok: false, error: "Usta topilmadi" };
    ustaName = u.name;
  }

  try {
    await db.$transaction(async (tx) => {
      // Manba qoldig'ini tranzaksiya ichida o'qib, yetarliligini tekshiramiz.
      const src = await tx.inventoryStock.findUnique({
        where: {
          locationType_locationId_equipmentTypeId: {
            locationType: srcType,
            locationId: srcId,
            equipmentTypeId,
          },
        },
      });
      const available = src?.quantity ?? 0;
      if (available < quantity) {
        throw new Error(
          srcType === "USTA"
            ? `Ustada yetarli emas (mavjud: ${available})`
            : `Omborda yetarli emas (mavjud: ${available})`,
        );
      }
      await tx.inventoryStock.update({
        where: { id: src!.id },
        data: { quantity: available - quantity },
      });

      // Mijoz uskunasini upsert (bir xil egalik turida jamlab boramiz).
      const existing = await tx.clientEquipment.findUnique({
        where: {
          clientId_equipmentTypeId_ownership: { clientId, equipmentTypeId, ownership },
        },
      });
      if (existing) {
        await tx.clientEquipment.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantity },
        });
      } else {
        await tx.clientEquipment.create({
          data: { clientId, equipmentTypeId, ownership, quantity },
        });
      }

      await tx.equipmentMovement.create({
        data: {
          equipmentTypeId,
          quantity,
          fromType: srcType,
          fromId: srcId,
          toType: "CLIENT",
          toId: clientId,
          reason: ownership === "RENTAL" ? "Mijozga ijara" : "Mijozga sotuv",
          note: ustaName ? `Usta: ${ustaName}` : null,
          byUserId: m.userId,
        },
      });

      // Sotuv — bir martalik to'lov yoziladi (uskuna butunlay chiqib ketadi).
      if (ownership === "SOLD") {
        await tx.payment.create({
          data: {
            clientId,
            amount: type.salePrice * quantity,
            currency: client.currency,
            receiptNote: `Uskuna sotuvi: ${type.name} ×${quantity}`,
            recordedById: m.userId,
          },
        });
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Xatolik" };
  }

  await recomputeMode(clientId);

  await logAudit("Mijozga uskuna biriktirildi", {
    entity: "Client",
    entityId: clientId,
    detail:
      `${type.name} ×${quantity} (${ownership === "RENTAL" ? "ijara" : "sotuv"})` +
      (ustaName ? ` · ${ustaName} zaxirasidan` : " · ombordan"),
  });
  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/ombor");
  return { ok: true };
}

/**
 * Manager: mijozga BIR NECHTA texnikani BIR operatsiyada biriktiradi (usta bitta
 * komplekt olib boradi: monoblok + printer + router...). Umumiy egalik (ijara/
 * sotuv) va umumiy manba (ombor yoki bitta usta zaxirasi). Barcha qatorlar bitta
 * `$transaction` ichida — biror turda qoldiq yetmasa, hech nima yozilmaydi.
 * Sotuvda barcha turlar bo'yicha bitta yig'ma to'lov (Payment) yoziladi.
 */
export async function assignEquipmentBatchToClient(
  clientId: string,
  items: { equipmentTypeId: string; quantity: number }[],
  ownership: string,
  source: EquipmentSource = { type: "WAREHOUSE" },
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!["RENTAL", "SOLD"].includes(ownership)) {
    return { ok: false, error: "Egalik turi noto'g'ri" };
  }
  if (!items || items.length === 0) {
    return { ok: false, error: "Kamida bitta texnika kerak" };
  }

  // Bir xil tur bir necha qatorda kelsa — miqdorlarni birlashtiramiz.
  const merged = new Map<string, number>();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!it.equipmentTypeId) return { ok: false, error: "Texnika tanlanmagan" };
    if (!qty || qty <= 0) return { ok: false, error: "Miqdor noto'g'ri" };
    merged.set(it.equipmentTypeId, (merged.get(it.equipmentTypeId) ?? 0) + qty);
  }
  const entries = [...merged.entries()];

  const srcType = source.type === "USTA" ? "USTA" : WAREHOUSE;
  const srcId = source.type === "USTA" ? source.ustaId : WAREHOUSE;
  if (srcType === "USTA" && !srcId) return { ok: false, error: "Usta tanlanmagan" };

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const types = await db.equipmentType.findMany({
    where: { id: { in: entries.map(([id]) => id) } },
  });
  const typeById = new Map(types.map((t) => [t.id, t]));
  if (typeById.size !== entries.length) {
    return { ok: false, error: "Texnika turi topilmadi" };
  }

  let ustaName: string | null = null;
  if (srcType === "USTA") {
    const u = await db.user.findUnique({
      where: { id: srcId },
      select: { name: true, role: true },
    });
    if (!u || u.role !== "INSTALLER") return { ok: false, error: "Usta topilmadi" };
    ustaName = u.name;
  }

  try {
    await db.$transaction(async (tx) => {
      let saleTotal = 0;
      for (const [equipmentTypeId, quantity] of entries) {
        const type = typeById.get(equipmentTypeId)!;

        const src = await tx.inventoryStock.findUnique({
          where: {
            locationType_locationId_equipmentTypeId: {
              locationType: srcType,
              locationId: srcId,
              equipmentTypeId,
            },
          },
        });
        const available = src?.quantity ?? 0;
        if (available < quantity) {
          throw new Error(
            `${type.name}: ${srcType === "USTA" ? "ustada" : "omborda"} yetarli emas (mavjud: ${available})`,
          );
        }
        await tx.inventoryStock.update({
          where: { id: src!.id },
          data: { quantity: available - quantity },
        });

        const existing = await tx.clientEquipment.findUnique({
          where: {
            clientId_equipmentTypeId_ownership: { clientId, equipmentTypeId, ownership },
          },
        });
        if (existing) {
          await tx.clientEquipment.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + quantity },
          });
        } else {
          await tx.clientEquipment.create({
            data: { clientId, equipmentTypeId, ownership, quantity },
          });
        }

        await tx.equipmentMovement.create({
          data: {
            equipmentTypeId,
            quantity,
            fromType: srcType,
            fromId: srcId,
            toType: "CLIENT",
            toId: clientId,
            reason: ownership === "RENTAL" ? "Mijozga ijara" : "Mijozga sotuv",
            note: ustaName ? `Usta: ${ustaName}` : null,
            byUserId: m.userId,
          },
        });

        if (ownership === "SOLD") saleTotal += type.salePrice * quantity;
      }

      // Sotuv — barcha turlar bo'yicha bitta yig'ma to'lov.
      if (ownership === "SOLD" && saleTotal > 0) {
        const note =
          "Uskuna sotuvi: " +
          entries.map(([id, q]) => `${typeById.get(id)!.name} ×${q}`).join(", ");
        await tx.payment.create({
          data: {
            clientId,
            amount: saleTotal,
            currency: client.currency,
            receiptNote: note,
            recordedById: m.userId,
          },
        });
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Xatolik" };
  }

  await recomputeMode(clientId);

  await logAudit("Mijozga uskunalar biriktirildi", {
    entity: "Client",
    entityId: clientId,
    detail:
      entries.map(([id, q]) => `${typeById.get(id)!.name} ×${q}`).join(", ") +
      ` (${ownership === "RENTAL" ? "ijara" : "sotuv"})` +
      (ustaName ? ` · ${ustaName} zaxirasidan` : " · ombordan"),
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

/**
 * Uskuna olib kelindi — ijara uskunalari usta zaxirasiga o'tadi.
 * Usta biriktirilgach jarayonni TP xodimi (OPERATOR) kuzatadi va yakunlaydi;
 * boshliq (ADMIN/MANAGER) ham yakunlashi mumkin.
 */
export async function confirmReturnCollected(requestId: string): Promise<EqState> {
  const session = await requireSession();
  const req = await db.equipmentReturnRequest.findUnique({
    where: { id: requestId },
    include: { client: { include: { equipmentItems: true } } },
  });
  if (!req || req.status !== "APPROVED") {
    return { ok: false, error: "Ariza topilmadi yoki holati o'zgargan" };
  }
  const canConfirm =
    ["ADMIN", "MANAGER", "OPERATOR"].includes(session.role) ||
    req.ustaId === session.userId;
  if (!canConfirm) {
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

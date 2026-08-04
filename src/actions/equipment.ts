"use server";

import { revalidatePath } from "next/cache";
import { safeNote } from "@/lib/validation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { refuseClient } from "@/actions/clients";

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
  opts: { alreadyInstalled?: boolean } = {},
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!["RENTAL", "SOLD"].includes(ownership)) {
    return { ok: false, error: "Egalik turi noto'g'ri" };
  }
  // "Allaqachon o'rnatilgan" — oldindan mavjud mijoz uchun: uskuna omborda emas,
  // allaqachon mijozda. Shuning uchun manba qoldig'i AYIRILMAYDI va sotuvda yangi
  // Payment YOZILMAYDI (tarixiy — allaqachon to'langan/o'rnatilgan).
  const installed = opts.alreadyInstalled === true;
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
  if (!installed && srcType === "USTA" && !srcId) {
    return { ok: false, error: "Usta tanlanmagan" };
  }

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

        // "O'rnatilgan" rejimda uskuna manbadan (ombor/usta) kelmaydi — qoldiq
        // ayirilmaydi. Aks holda manbadan yetarlicha bo'lishi tekshiriladi va ayiriladi.
        if (!installed) {
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
        }

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
            fromType: installed ? null : srcType,
            fromId: installed ? null : srcId,
            toType: "CLIENT",
            toId: clientId,
            reason: installed
              ? "Allaqachon o'rnatilgan (import)"
              : ownership === "RENTAL"
                ? "Mijozga ijara"
                : "Mijozga sotuv",
            note: ustaName ? `Usta: ${ustaName}` : null,
            byUserId: m.userId,
          },
        });

        if (!installed && ownership === "SOLD") saleTotal += type.salePrice * quantity;
      }

      // Sotuv — barcha turlar bo'yicha bitta yig'ma to'lov (o'rnatilganda YOZILMAYDI).
      if (!installed && ownership === "SOLD" && saleTotal > 0) {
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
      (installed
        ? " · allaqachon o'rnatilgan"
        : ustaName
          ? ` · ${ustaName} zaxirasidan`
          : " · ombordan"),
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
  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

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
    where: { clientId, status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } },
  });
  if (open) {
    return { ok: false, error: "Bu mijoz uchun ochiq qaytarish arizasi mavjud" };
  }

  await db.equipmentReturnRequest.create({
    data: { clientId, byUserId: session.userId, note: noteText, status: "PENDING" },
  });
  // Ariza ochilishi mijoz tarixida (qo'ng'iroqlar tarixi) ham qolsin.
  await db.callLog.create({
    data: {
      clientId,
      result: "RETURN_REQUESTED",
      note: noteText,
      operatorId: session.userId,
    },
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

// Qaytarishga mas'ul qilib biriktirilishi mumkin bo'lgan TP xodimi rollari.
const RETURN_STAFF_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];

/**
 * Boshliq: qaytarish arizasiga mas'ul TP xodim VA usta BIRGA biriktiriladi —
 * bittasi tanlanib ikkinchisi tanlanmasa ariza "Biriktirildi"ga o'tmaydi.
 * Izoh MAJBURIY (mas'ul/usta bilan qanday kelishilgani tarixda qolsin).
 */
export async function approveReturnRequest(
  requestId: string,
  staffId: string,
  ustaId: string,
  note: string,
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;

  if (!staffId || !ustaId) {
    return { ok: false, error: "Operator va usta ikkalasi ham tanlanishi kerak" };
  }
  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  const req = await db.equipmentReturnRequest.findUnique({
    where: { id: requestId },
    include: { client: true },
  });
  if (!req || req.status !== "PENDING") {
    return { ok: false, error: "Ariza topilmadi yoki holati o'zgargan" };
  }

  const [staff, usta] = await Promise.all([
    db.user.findFirst({
      where: { id: staffId, role: { in: RETURN_STAFF_ROLES }, isActive: true },
      select: { id: true, name: true },
    }),
    db.user.findFirst({
      where: { id: ustaId, role: "INSTALLER", isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!staff) return { ok: false, error: "Tanlangan xodim topilmadi" };
  if (!usta) return { ok: false, error: "Tanlangan usta topilmadi" };

  await db.equipmentReturnRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", ustaId: usta.id, staffId: staff.id },
  });
  await db.client.update({
    where: { id: req.clientId },
    data: { assignedUstaId: usta.id, ustaStatus: "ASSIGNED" },
  });
  await db.callLog.create({
    data: {
      clientId: req.clientId,
      result: "RETURN_ASSIGNED",
      note: noteText,
      operatorId: m.userId,
    },
  });
  await logAudit("Qaytarish: operator/usta biriktirildi", {
    entity: "Client",
    entityId: req.clientId,
    detail: `${req.client.restaurantName} → ${staff.name} / ${usta.name}`,
  });
  // Mas'ul xodimga ilova-ichi bildirishnoma (o'ziga biriktirsa — yubormaydi)
  if (staff.id !== m.userId) {
    await createNotification({
      title: "Sizga yangi qaytarish arizasi biriktirildi",
      body: req.client.restaurantName,
      userIds: [staff.id],
    });
  }
  revalidatePath("/qaytarish");
  revalidatePath(`/mijozlar/${req.clientId}`);
  return { ok: true };
}

/** Manager: qaytarish arizasini rad etadi. Rad etish sababi (izoh) MAJBURIY. */
export async function rejectReturnRequest(
  requestId: string,
  note: string,
): Promise<EqState> {
  const m = await requireManager();
  if (!m.ok) return m;

  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  const req = await db.equipmentReturnRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") {
    return { ok: false, error: "Ariza topilmadi yoki holati o'zgargan" };
  }
  await db.equipmentReturnRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      resolvedAt: new Date(),
      // Rad etish izohi ALOHIDA maydonga — ilgari `note` ustiga yozilardi va
      // arizaning asl sababi yo'qolardi.
      resolutionNote: noteText,
    },
  });
  await db.callLog.create({
    data: {
      clientId: req.clientId,
      result: "RETURN_REJECTED",
      note: noteText,
      operatorId: m.userId,
    },
  });
  await logAudit("Qaytarish rad etildi", { entity: "Client", entityId: req.clientId });
  revalidatePath("/qaytarish");
  revalidatePath(`/mijozlar/${req.clientId}`);
  return { ok: true };
}

/**
 * Usta biriktirilgan arizani "Jarayonda"ga o'tkazish — TP xodimi (OPERATOR) ustaga
 * xabar berdi va uskuna olib kelish jarayoni boshlandi. Boshliq ham qila oladi.
 * Izoh (ustaga qanday xabar berilgani) MAJBURIY.
 */
export async function startReturnProgress(requestId: string, note: string): Promise<EqState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  const req = await db.equipmentReturnRequest.findUnique({
    where: { id: requestId },
    include: { client: { select: { restaurantName: true } } },
  });
  if (!req || req.status !== "APPROVED") {
    return { ok: false, error: "Ariza topilmadi yoki holati o'zgargan" };
  }
  await db.equipmentReturnRequest.update({
    where: { id: requestId },
    data: { status: "IN_PROGRESS", inProgressAt: new Date(), slaNotifiedAt: null },
  });
  await db.client.update({
    where: { id: req.clientId },
    data: { ustaStatus: "EN_ROUTE" },
  });
  await db.callLog.create({
    data: {
      clientId: req.clientId,
      result: "RETURN_IN_PROGRESS",
      note: noteText,
      operatorId: session.userId,
    },
  });
  await logAudit("Qaytarish: jarayonga o'tdi", {
    entity: "Client",
    entityId: req.clientId,
    detail: req.client.restaurantName,
  });
  revalidatePath("/qaytarish");
  revalidatePath(`/mijozlar/${req.clientId}`);
  return { ok: true };
}

/**
 * Uskuna olib kelindi — ijara uskunalari usta zaxirasiga o'tadi va mijoz
 * `refuseClient` orqali Otkazga o'tkaziladi (ijara bekor qilingani = xizmatdan
 * voz kechgani). Usta biriktirilgach jarayonni TP xodimi (OPERATOR) kuzatadi
 * va yakunlaydi; boshliq (ADMIN/MANAGER) ham yakunlashi mumkin. Biriktirilgan
 * (APPROVED) yoki jarayondagi (IN_PROGRESS) arizadan yakunlanadi.
 *
 * `note` — yakunlash izohi (masalan "printer shikastlangan holda qaytdi") —
 * MAJBURIY.
 */
export async function confirmReturnCollected(
  requestId: string,
  note: string,
): Promise<EqState> {
  const session = await requireSession();
  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  const req = await db.equipmentReturnRequest.findUnique({
    where: { id: requestId },
    include: { client: { include: { equipmentItems: true } } },
  });
  if (!req || !["APPROVED", "IN_PROGRESS"].includes(req.status)) {
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
    data: { status: "DONE", resolvedAt: new Date(), resolutionNote: noteText },
  });
  await db.client.update({
    where: { id: req.clientId },
    data: { ustaStatus: "DONE" },
  });
  await recomputeMode(req.clientId);
  await db.callLog.create({
    data: {
      clientId: req.clientId,
      result: "RETURN_DONE",
      note: noteText,
      operatorId: session.userId,
    },
  });

  // Ijara uskunasi qaytarib olindi = mijoz xizmatdan voz kechdi — otkazga
  // o'tkazamiz. Allaqachon otkaz bo'lsa (masalan otkaz avval, uskuna keyin
  // olib kelingan bo'lsa) qayta urinmaymiz — refuseClient bunga xato qaytaradi.
  if (req.client.stage !== "REFUSED") {
    await refuseClient(req.clientId, noteText);
  }

  await logAudit("Uskuna qaytarib olindi", {
    entity: "Client",
    entityId: req.clientId,
    detail: `${req.client.restaurantName} — ${noteText}`,
  });
  revalidatePath("/qaytarish");
  revalidatePath("/ombor");
  revalidatePath(`/mijozlar/${req.clientId}`);
  return { ok: true };
}

/**
 * Qaytarish arizasini bir bosqich orqaga qaytaradi — xato bosilgan tugmani
 * tuzatish uchun (masalan usta noto'g'ri biriktirildi yoki "jarayonga
 * o'tkazish" chala bosildi). Ruxsat bosqichning oldingi harakatiga mos:
 * IN_PROGRESS→APPROVED (startReturnProgress'ni bekor qiladi, STAFF qila
 * oladi), APPROVED→PENDING (approveReturnRequest'ni bekor qiladi, usta
 * biriktiruvini yechadi, faqat boshliq), PENDING'da orqasi yo'q — ariza
 * butunlay bekor qilinadi (faqat boshliq, `rejectReturnRequest` kabi).
 */
export async function revertReturnRequest(requestId: string): Promise<EqState> {
  const session = await requireSession();
  const req = await db.equipmentReturnRequest.findUnique({
    where: { id: requestId },
    include: { client: { select: { restaurantName: true } } },
  });
  if (!req) return { ok: false, error: "Ariza topilmadi" };

  if (req.status === "IN_PROGRESS") {
    if (!["ADMIN", "MANAGER", "OPERATOR"].includes(session.role)) {
      return { ok: false, error: "Ruxsat yo'q" };
    }
    await db.equipmentReturnRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", inProgressAt: null, slaNotifiedAt: null },
    });
    await db.client.update({
      where: { id: req.clientId },
      data: { ustaStatus: "ASSIGNED" },
    });
    await db.callLog.create({
      data: { clientId: req.clientId, result: "RETURN_REVERTED", operatorId: session.userId },
    });
    await logAudit("Qaytarish: jarayondan orqaga qaytarildi", {
      entity: "Client",
      entityId: req.clientId,
      detail: req.client.restaurantName,
    });
  } else if (req.status === "APPROVED") {
    if (!["ADMIN", "MANAGER"].includes(session.role)) {
      return { ok: false, error: "Ruxsat yo'q" };
    }
    await db.equipmentReturnRequest.update({
      where: { id: requestId },
      data: { status: "PENDING", ustaId: null, staffId: null },
    });
    await db.client.update({
      where: { id: req.clientId },
      data: { ustaStatus: null, assignedUstaId: null },
    });
    await db.callLog.create({
      data: { clientId: req.clientId, result: "RETURN_REVERTED", operatorId: session.userId },
    });
    await logAudit("Qaytarish: operator/usta biriktiruvi bekor qilindi (orqaga)", {
      entity: "Client",
      entityId: req.clientId,
      detail: req.client.restaurantName,
    });
  } else if (req.status === "PENDING") {
    if (!["ADMIN", "MANAGER"].includes(session.role)) {
      return { ok: false, error: "Ruxsat yo'q" };
    }
    await db.equipmentReturnRequest.delete({ where: { id: requestId } });
    await db.callLog.create({
      data: { clientId: req.clientId, result: "RETURN_REVERTED", operatorId: session.userId },
    });
    await logAudit("Qaytarish arizasi bekor qilindi (orqaga)", {
      entity: "Client",
      entityId: req.clientId,
      detail: req.client.restaurantName,
    });
  } else {
    return { ok: false, error: "Bu bosqichda orqaga qaytarib bo'lmaydi" };
  }

  revalidatePath("/qaytarish");
  revalidatePath(`/mijozlar/${req.clientId}`);
  return { ok: true };
}

/**
 * Nofaol mijozlarda qolib ketgan uskuna yozuvlarini tozalaydi.
 *
 * NEGA KERAK: uskuna mijozdan qaytarib olingan, lekin qaytarish tizim orqali
 * emas, qo'lda amalga oshirilgan — natijada `ClientEquipment` yozuvi o'chirilmay
 * qolgan. Bu yozuvlar mijoz kartasida ham, uskuna analitikasida ham mavjud
 * bo'lib turadi va "mijozlarda turgan uskuna" raqamini oshirib ko'rsatadi.
 *
 * OMBOR QOLDIG'IGA TEGILMAYDI. Bular tarixiy o'rnatishlar — o'rnatilganda ham
 * sklad hisobidan o'tmagan (`INSTALL_LEGACY`), shuning uchun qaytganda ham
 * qoldiqqa qo'shilmaydi; aks holda hech qachon hisobga kirmagan dona ombor
 * qoldig'ini shishirib yuborardi. Uskuna jismonan qayerdaligi ma'lum bo'lsa,
 * ombor bo'limidan qo'lda kirim qilinadi.
 *
 * `EquipmentMovement` ham yozilmaydi: harakat sanasi noma'lum, soxta sana
 * bilan yozish oylik oqim grafigini buzardi. O'chirilgan yozuvlar audit
 * jurnalida qoladi.
 */
export async function clearInactiveClientEquipment(): Promise<
  EqState & { removed?: number; clients?: number }
> {
  const guard = await requireManager();
  if (!guard.ok) return guard;

  const stale = await db.clientEquipment.findMany({
    where: { quantity: { gt: 0 }, client: { status: { not: "ACTIVE" } } },
    select: {
      id: true,
      clientId: true,
      quantity: true,
      ownership: true,
      equipmentType: { select: { name: true } },
      client: { select: { restaurantName: true } },
    },
  });
  if (stale.length === 0) return { ok: true, removed: 0, clients: 0 };

  const clientIds = [...new Set(stale.map((e) => e.clientId))];
  const removed = stale.reduce((n, e) => n + e.quantity, 0);

  await db.clientEquipment.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
  for (const id of clientIds) await recomputeMode(id);

  // Nima o'chirilgani auditda qoladi — bu yagona tiklash manbai.
  await logAudit("Nofaol mijozlardagi uskuna yozuvlari tozalandi", {
    entity: "ClientEquipment",
    detail:
      `${removed} dona · ${clientIds.length} mijoz — ` +
      stale
        .map(
          (e) =>
            `${e.client.restaurantName}: ${e.equipmentType.name} ×${e.quantity}` +
            ` (${e.ownership === "RENTAL" ? "ijara" : "sotuv"})`,
        )
        .join("; "),
  });

  revalidatePath("/uskuna-analitika");
  revalidatePath("/ombor");
  revalidatePath("/");
  return { ok: true, removed, clients: clientIds.length };
}

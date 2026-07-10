"use server";

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { saveHandoutDoc } from "@/lib/handout-docs";
import type { HandoutMode } from "@/lib/constants";

export type InvState = { ok: boolean; error?: string };

const WAREHOUSE = "WAREHOUSE";
const USTA = "USTA";

/** Joylashuv (ombor/usta) qoldig'iga qo'llaniladigan bitta o'zgarish. */
type StockDelta = {
  locationType: string;
  locationId: string;
  equipmentTypeId: string;
  delta: number;
};

function locName(locationType: string): string {
  return locationType === WAREHOUSE ? "Ombor" : locationType === USTA ? "Usta" : locationType;
}

/**
 * Bir nechta qoldiq o'zgarishini tranzaksiya ichida QAT'IY muvozanat bilan
 * qo'llaydi. Bir xil hujayra (locationType+locationId+equipmentTypeId) bo'yicha
 * deltalar netlashtiriladi, so'ng yakuniy qoldiq 0 dan past bo'lmasligi
 * tekshiriladi (aks holda butun tranzaksiya rollback bo'ladi).
 *
 * Bu funksiya taqsimotni to'liq qaytarib (rollback) qayta qo'llash uchun
 * ishlatiladi — usta yoki texnika turi o'zgarganda ham to'g'ri ishlaydi.
 */
async function applyStockDeltas(
  tx: Prisma.TransactionClient,
  deltas: StockDelta[],
): Promise<void> {
  const merged = new Map<string, StockDelta>();
  for (const d of deltas) {
    const key = `${d.locationType}|${d.locationId}|${d.equipmentTypeId}`;
    const cur = merged.get(key);
    if (cur) cur.delta += d.delta;
    else merged.set(key, { ...d });
  }

  for (const d of merged.values()) {
    if (d.delta === 0) continue;
    const row = await tx.inventoryStock.findUnique({
      where: {
        locationType_locationId_equipmentTypeId: {
          locationType: d.locationType,
          locationId: d.locationId,
          equipmentTypeId: d.equipmentTypeId,
        },
      },
    });
    const current = row?.quantity ?? 0;
    const next = current + d.delta;
    if (next < 0) {
      throw new Error(`${locName(d.locationType)}da yetarli emas (mavjud: ${current})`);
    }
    if (row) {
      await tx.inventoryStock.update({ where: { id: row.id }, data: { quantity: next } });
    } else {
      await tx.inventoryStock.create({
        data: {
          locationType: d.locationType,
          locationId: d.locationId,
          equipmentTypeId: d.equipmentTypeId,
          quantity: next,
        },
      });
    }
  }
}

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

/**
 * Ombor → Usta ko'p turdagi taqsimot: bitta ustaga bir nechta texnikani
 * BIR operatsiyada beradi. Barcha qatorlar bitta `db.$transaction` ichida
 * bajariladi — biror qatorda xatolik (masalan omborda yetarli emas) bo'lsa,
 * hech qaysi qator qo'llanmaydi (hammasi rollback bo'ladi).
 *
 * Topshirish rejimi (`handoutMode`):
 *  - "WITH_DOC"    — imzolangan hujjat bilan. Hujjat keyinroq yuklanishi mumkin,
 *                    shu bois `documentStatus` = PENDING_DOC (yoki hujjat darrov
 *                    berilsa UPLOADED). Izoh ixtiyoriy.
 *  - "WITHOUT_DOC" — hujjatsiz. Izoh (note) MAJBURIY; `documentStatus` = NOT_REQUIRED.
 */
export async function transferBatchToUsta(
  ustaId: string,
  items: { equipmentId: string; quantity: number }[],
  note: string,
  handoutMode: HandoutMode,
  signedDocUrl?: string,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;

  // Hujjatsiz yuborishda izoh majburiy (hujjatli rejimda hujjat isbot bo'ladi).
  if (handoutMode === "WITHOUT_DOC" && !note.trim()) {
    return { ok: false, error: "Hujjatsiz yuborish uchun izoh kiritish majburiy!" };
  }
  if (!items || items.length === 0) {
    return { ok: false, error: "Kamida bitta texnika kerak" };
  }

  // Har bir yozuvga yoziladigan hujjat holati.
  const documentStatus =
    handoutMode === "WITHOUT_DOC"
      ? "NOT_REQUIRED"
      : signedDocUrl
        ? "UPLOADED"
        : "PENDING_DOC";

  // Bir xil texnika turi bir necha qatorda kelsa — miqdorlarni birlashtiramiz
  // (aks holda bitta tur ustidan ikki marta yozuv/qoldiq nazorati ketardi).
  const merged = new Map<string, number>();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!it.equipmentId) return { ok: false, error: "Texnika tanlanmagan" };
    if (!qty || qty <= 0) return { ok: false, error: "Miqdor noto'g'ri" };
    merged.set(it.equipmentId, (merged.get(it.equipmentId) ?? 0) + qty);
  }
  const entries = [...merged.entries()];

  const usta = await db.user.findUnique({ where: { id: ustaId } });
  if (!usta || usta.role !== "INSTALLER") return { ok: false, error: "Usta topilmadi" };

  const types = await db.equipmentType.findMany({
    where: { id: { in: entries.map(([id]) => id) } },
  });
  const typeById = new Map(types.map((t) => [t.id, t]));

  try {
    await db.$transaction(async (tx) => {
      const trimmedNote = note.trim();
      for (const [equipmentTypeId, quantity] of entries) {
        const type = typeById.get(equipmentTypeId);
        if (!type) throw new Error("Texnika turi topilmadi");

        // Ombordagi qoldiqni tranzaksiya ichida o'qiymiz.
        const wh = await tx.inventoryStock.findUnique({
          where: {
            locationType_locationId_equipmentTypeId: {
              locationType: WAREHOUSE,
              locationId: WAREHOUSE,
              equipmentTypeId,
            },
          },
        });
        const available = wh?.quantity ?? 0;
        if (available < quantity) {
          throw new Error(`${type.name}: omborda yetarli emas (mavjud: ${available})`);
        }

        // Ombordan ayiramiz (available >= quantity > 0 => wh mavjud).
        await tx.inventoryStock.update({
          where: { id: wh!.id },
          data: { quantity: available - quantity },
        });

        // Ustaga qo'shamiz (upsert).
        const ustaStock = await tx.inventoryStock.findUnique({
          where: {
            locationType_locationId_equipmentTypeId: {
              locationType: "USTA",
              locationId: ustaId,
              equipmentTypeId,
            },
          },
        });
        if (ustaStock) {
          await tx.inventoryStock.update({
            where: { id: ustaStock.id },
            data: { quantity: ustaStock.quantity + quantity },
          });
        } else {
          await tx.inventoryStock.create({
            data: { locationType: "USTA", locationId: ustaId, equipmentTypeId, quantity },
          });
        }

        // Har bir tur uchun alohida harakat jurnali yozuvi.
        await tx.equipmentMovement.create({
          data: {
            equipmentTypeId,
            quantity,
            fromType: WAREHOUSE,
            fromId: WAREHOUSE,
            toType: "USTA",
            toId: ustaId,
            reason: "Ustaga taqsimot",
            note: trimmedNote || null,
            byUserId: m.userId,
            documentStatus,
            signedDocUrl: signedDocUrl ?? null,
          },
        });
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Xatolik" };
  }

  await logAudit("Ustaga texnika berildi", {
    entity: "Equipment",
    detail:
      `${usta.name} ← ` +
      entries.map(([id, q]) => `${typeById.get(id)?.name ?? id} ${q}`).join(", "),
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/**
 * Topshirish hujjati faylini saqlaydi va nisbiy URL qaytaradi. Komponent buni
 * transferdan oldin (hujjat bilan yuborish) yoki keyinroq (imzolangan hujjatni
 * biriktirish) chaqiradi. pdf/jpg/jpeg qabul qilinadi.
 */
export async function uploadHandoutFile(
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const m = await requireManager();
  if (!m.ok) return { ok: false, error: m.error };

  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) {
    return { ok: false, error: "Fayl tanlanmagan" };
  }
  const buffer = Buffer.from(await f.arrayBuffer());
  const saved = await saveHandoutDoc(buffer, f.type, randomUUID());
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, url: saved.relPath };
}

/**
 * Imzolangan topshirish hujjatini mavjud harakat yozuviga biriktiradi:
 * documentStatus PENDING_DOC → UPLOADED. Fayl avval `uploadHandoutFile` orqali
 * saqlanadi, so'ng uning URL'i shu yerga beriladi.
 */
export async function uploadSignedDocument(
  movementId: string,
  fileUrl: string,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;
  if (!fileUrl || !fileUrl.trim()) return { ok: false, error: "Hujjat yo'q" };

  const mv = await db.equipmentMovement.findUnique({ where: { id: movementId } });
  if (!mv) return { ok: false, error: "Harakat topilmadi" };
  if (mv.reason !== "Ustaga taqsimot") {
    return { ok: false, error: "Bu harakatga hujjat biriktirib bo'lmaydi" };
  }

  await db.equipmentMovement.update({
    where: { id: movementId },
    data: { signedDocUrl: fileUrl.trim(), documentStatus: "UPLOADED" },
  });
  await logAudit("Topshirish hujjati yuklandi", {
    entity: "Equipment",
    detail: `Movement ${movementId}`,
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/**
 * Ustaga taqsimot yozuvini (EquipmentMovement) TO'LIQ tahrirlash — ustani,
 * texnika turini, miqdorni va izohni o'zgartirish mumkin. Ombor va usta
 * qoldig'i QAT'IY muvozanatda saqlanadi.
 *
 * Usul: avval eski harakat ta'sirini butunlay QAYTARAMIZ (rollback), so'ng
 * yangi ta'sirni QO'LLAYMIZ (apply). Deltalar `applyStockDeltas` orqali
 * netlashtiriladi — usta yoki texnika turi o'zgarganda ham to'g'ri ishlaydi.
 *   Rollback:  ombor += oldQty;  eski usta -= oldQty
 *   Apply:     ombor -= newQty;  yangi usta += newQty
 *
 * Eslatma: bu bazada "master" = usta; stok `locationType = "USTA"`,
 * `locationId = ustaId` (toId) sifatida saqlanadi.
 */
export async function updateHandoutMovement(
  movementId: string,
  data: {
    toId: string;
    equipmentTypeId: string;
    quantity: number;
    note: string;
    handoutMode: string;
  },
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;

  const newQuantity = Number(data.quantity);
  if (!newQuantity || newQuantity <= 0) return { ok: false, error: "Miqdor noto'g'ri" };
  if (!data.toId) return { ok: false, error: "Usta tanlanmagan" };
  if (!data.equipmentTypeId) return { ok: false, error: "Texnika tanlanmagan" };

  const mv = await db.equipmentMovement.findUnique({ where: { id: movementId } });
  if (!mv) return { ok: false, error: "Harakat topilmadi" };
  // Faqat ombor→usta taqsimotini tahrirlashga ruxsat (boshqa harakatlar emas).
  if (mv.reason !== "Ustaga taqsimot" || mv.toType !== USTA || !mv.toId) {
    return { ok: false, error: "Faqat ustaga taqsimot yozuvini tahrirlash mumkin" };
  }

  const handoutMode = data.handoutMode === "WITHOUT_DOC" ? "WITHOUT_DOC" : "WITH_DOC";
  const note = (data.note ?? "").trim();
  if (handoutMode === "WITHOUT_DOC" && !note) {
    return { ok: false, error: "Hujjatsiz yuborish uchun izoh kiritish majburiy!" };
  }

  // Yangi usta va texnika turini tekshiramiz.
  const [usta, type] = await Promise.all([
    db.user.findUnique({ where: { id: data.toId } }),
    db.equipmentType.findUnique({ where: { id: data.equipmentTypeId } }),
  ]);
  if (!usta || usta.role !== "INSTALLER") return { ok: false, error: "Usta topilmadi" };
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };

  const oldQuantity = mv.quantity;

  // documentStatus'ni rejim bo'yicha qayta hisoblaymiz (mavjud hujjat saqlanadi).
  const documentStatus =
    handoutMode === "WITHOUT_DOC"
      ? "NOT_REQUIRED"
      : mv.signedDocUrl
        ? mv.documentStatus === "APPROVED"
          ? "APPROVED"
          : "UPLOADED"
        : "PENDING_DOC";

  try {
    await db.$transaction(async (tx) => {
      await applyStockDeltas(tx, [
        // 1) Eski ta'sirni qaytaramiz (rollback).
        { locationType: WAREHOUSE, locationId: WAREHOUSE, equipmentTypeId: mv.equipmentTypeId, delta: oldQuantity },
        { locationType: USTA, locationId: mv.toId!, equipmentTypeId: mv.equipmentTypeId, delta: -oldQuantity },
        // 2) Yangi ta'sirni qo'llaymiz (apply).
        { locationType: WAREHOUSE, locationId: WAREHOUSE, equipmentTypeId: data.equipmentTypeId, delta: -newQuantity },
        { locationType: USTA, locationId: data.toId, equipmentTypeId: data.equipmentTypeId, delta: newQuantity },
      ]);

      await tx.equipmentMovement.update({
        where: { id: movementId },
        data: {
          toId: data.toId,
          equipmentTypeId: data.equipmentTypeId,
          quantity: newQuantity,
          note: note || null,
          documentStatus,
        },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Xatolik" };
  }

  await logAudit("Taqsimot tahrirlandi", {
    entity: "Equipment",
    detail: `Movement ${movementId}: ${oldQuantity} → ${newQuantity} dona (${usta.name} · ${type.name})`,
  });
  revalidatePath("/ombor");
  return { ok: true };
}

/**
 * Ustaga taqsimot yozuvini BUTUNLAY o'chirish + to'liq rollback: texnikani
 * omborga qaytaradi, ustadan ayiradi, qoldiq manfiy bo'lmasligini tekshiradi,
 * so'ng harakat yozuvini o'chiradi.
 */
export async function deleteHandoutMovement(movementId: string): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;

  const mv = await db.equipmentMovement.findUnique({ where: { id: movementId } });
  if (!mv) return { ok: false, error: "Harakat topilmadi" };
  if (mv.reason !== "Ustaga taqsimot" || mv.toType !== USTA || !mv.toId) {
    return { ok: false, error: "Faqat ustaga taqsimot yozuvini o'chirish mumkin" };
  }

  try {
    await db.$transaction(async (tx) => {
      // To'liq rollback: ombor += qty, usta -= qty.
      await applyStockDeltas(tx, [
        { locationType: WAREHOUSE, locationId: WAREHOUSE, equipmentTypeId: mv.equipmentTypeId, delta: mv.quantity },
        { locationType: USTA, locationId: mv.toId!, equipmentTypeId: mv.equipmentTypeId, delta: -mv.quantity },
      ]);
      await tx.equipmentMovement.delete({ where: { id: movementId } });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Xatolik" };
  }

  await logAudit("Taqsimot o'chirildi", {
    entity: "Equipment",
    detail: `Movement ${movementId}: ${mv.quantity} dona omborga qaytarildi`,
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

/**
 * Texnika turini o'chirish — bog'liqliklarni xavfsiz tekshirib.
 * Ombor/usta zaxirasida dona bo'lsa, mijozlarga biriktirilgan bo'lsa yoki
 * harakat tarixi (kirim/taqsimot/brak) mavjud bo'lsa — o'chirilmaydi
 * (tarix va yaxlitlik saqlanadi; bunday hollarda "Faolsiz" tavsiya etiladi).
 */
export async function deleteEquipmentType(
  equipmentTypeId: string,
): Promise<InvState> {
  const m = await requireManager();
  if (!m.ok) return m;

  const type = await db.equipmentType.findUnique({
    where: { id: equipmentTypeId },
    include: { stock: true, _count: { select: { clientEquipment: true } } },
  });
  if (!type) return { ok: false, error: "Texnika turi topilmadi" };

  // 1) Ombor yoki usta qo'lida dona bo'lsa — o'chirib bo'lmaydi.
  const inStock = type.stock.reduce((sum, r) => sum + r.quantity, 0);
  if (inStock > 0) {
    return {
      ok: false,
      error: `Zaxirada ${inStock} dona bor. Avval nolga tushiring, so'ng o'chiring.`,
    };
  }

  // 2) Mijozlarga o'rnatilgan bo'lsa — o'chirib bo'lmaydi.
  if (type._count.clientEquipment > 0) {
    return { ok: false, error: "Mijozlarga biriktirilgan — o'chirib bo'lmaydi." };
  }

  // 3) Harakat tarixi (jurnal) bo'lsa — tarixni saqlash uchun o'chirmaymiz.
  const movements = await db.equipmentMovement.count({ where: { equipmentTypeId } });
  if (movements > 0) {
    return {
      ok: false,
      error: "Harakat tarixi mavjud. O'chirish o'rniga 'Faolsiz' qiling (tarix saqlanadi).",
    };
  }

  // Toza — qolgan nol-qoldiq zaxira yozuvlarini tozalab, tranzaksiyada o'chiramiz.
  await db.$transaction(async (tx) => {
    await tx.inventoryStock.deleteMany({ where: { equipmentTypeId } });
    await tx.equipmentType.delete({ where: { id: equipmentTypeId } });
  });

  await logAudit("Texnika turi o'chirildi", { entity: "Equipment", detail: type.name });
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

// Integratsion testlar uchun yordamchilar: bazani tozalash, fixture yaratish,
// sessiyani o'rnatish.

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { encodeSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { setTestCookie, clearTestCookies } from "./integration-setup";

/**
 * Barcha jadvallarni tozalaydi (migratsiya tarixidan tashqari).
 *
 * TRUNCATE ... CASCADE ishlatiladi — bog'liqlik tartibini qo'lda saqlash shart
 * emas va DELETE dan tezroq.
 */
export async function resetDb(): Promise<void> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  clearTestCookies();
  // `PipelineStage` — bo'sh zanjir bilan Muammolar/Eskalatsiya/Qaytarish/Yangi
  // versiya endi ishlay olmaydi (bo'sh o'rtadagi bosqichlar = "IN_PROGRESS"
  // kabi kalitlar noto'g'ri holat deb rad etiladi). Prodda bu qator migratsiya
  // bilan keladi (`20260901123820_seed_pipeline_stages`) — testda ham xuddi
  // shu boshlang'ich holatni takrorlaymiz.
  await db.pipelineStage.createMany({
    data: [
      { pipeline: "MUAMMOLAR", key: "IN_PROGRESS", label: "Jarayonda", order: 0 },
      { pipeline: "VERSIYA", key: "IN_PROGRESS", label: "Jarayonda", order: 0 },
      { pipeline: "ESKALATSIYA", key: "EN_ROUTE", label: "Yo'ldaman", order: 0 },
      { pipeline: "ESKALATSIYA", key: "ARRIVED", label: "Bordim", order: 1 },
      { pipeline: "QAYTARISH", key: "IN_PROGRESS", label: "Jarayonda", order: 0 },
    ],
  });
}

type Role = "ADMIN" | "MANAGER" | "OPERATOR" | "INSTALLER";

/** Foydalanuvchi yaratadi (parol: "parol12345"). */
export async function makeUser(
  role: Role,
  over: Partial<{ name: string; username: string; isActive: boolean; region: string }> = {},
) {
  const username = over.username ?? `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
  return db.user.create({
    data: {
      name: over.name ?? `${role} test`,
      username,
      passwordHash: await bcrypt.hash("parol12345", 10),
      role,
      isActive: over.isActive ?? true,
      region: over.region ?? null,
    },
  });
}

/**
 * Berilgan foydalanuvchi nomidan "kirgan" holatga o'tadi — haqiqiy JWT
 * yaratib, mock cookie do'koniga qo'yadi. Action'lar shu sessiyani o'qiydi.
 */
export async function loginAs(user: {
  id: string;
  name: string;
  username: string;
  role: string;
  sessionVersion: number;
}): Promise<void> {
  const token = await encodeSession({
    userId: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    version: user.sessionVersion,
  });
  setTestCookie(SESSION_COOKIE_NAME, token);
}

/** Tizimdan chiqqan holat. */
export function logout(): void {
  clearTestCookies();
}

/** Mijoz yaratadi. */
export async function makeClient(
  over: Partial<{
    restaurantName: string;
    fullName: string;
    phone: string;
    contractNumber: string;
    monthlyAmount: number;
    currency: string;
    debtAmount: number;
    status: string;
    assignedToId: string;
    nextPaymentDate: Date;
    contractDate: Date;
  }> = {},
) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return db.client.create({
    data: {
      fullName: over.fullName ?? `Mijoz ${rnd}`,
      restaurantName: over.restaurantName ?? `Restoran ${rnd}`,
      phone: over.phone ?? `9989${Math.floor(10000000 + Math.random() * 89999999)}`,
      contractNumber: over.contractNumber ?? `TP-${rnd}`,
      monthlyAmount: over.monthlyAmount ?? 29,
      currency: over.currency ?? "USD",
      debtAmount: over.debtAmount ?? 0,
      status: over.status ?? "ACTIVE",
      assignedToId: over.assignedToId ?? null,
      nextPaymentDate: over.nextPaymentDate ?? null,
      contractDate: over.contractDate ?? new Date("2026-01-15"),
    },
  });
}

/** Texnika turi + ombor qoldig'i. */
export async function makeEquipment(
  name: string,
  opts: { warehouseQty?: number; rentalPrice?: number; salePrice?: number } = {},
) {
  const type = await db.equipmentType.create({
    data: {
      name,
      rentalPrice: opts.rentalPrice ?? 5,
      salePrice: opts.salePrice ?? 100,
    },
  });
  if (opts.warehouseQty) {
    await db.inventoryStock.create({
      data: {
        locationType: "WAREHOUSE",
        locationId: "WAREHOUSE",
        equipmentTypeId: type.id,
        quantity: opts.warehouseQty,
      },
    });
  }
  return type;
}

/** Ombor yoki usta qoldig'ini o'qiydi. */
export async function stockOf(
  equipmentTypeId: string,
  locationType = "WAREHOUSE",
  locationId = "WAREHOUSE",
): Promise<number> {
  const row = await db.inventoryStock.findUnique({
    where: {
      locationType_locationId_equipmentTypeId: { locationType, locationId, equipmentTypeId },
    },
  });
  return row?.quantity ?? 0;
}

/** 1x1 PNG — chek rasmi o'rniga (haqiqiy tasvir baytlari). */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** FormData yasash (fayl bilan yoki fayl'siz). */
export function formData(
  fields: Record<string, string>,
  file?: { field: string; name: string; type: string; data: Buffer },
): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) {
    fd.append(
      file.field,
      new File([new Uint8Array(file.data)], file.name, { type: file.type }),
    );
  }
  return fd;
}

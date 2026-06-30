"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";
import { normalizeRegion } from "@/lib/constants";
import { num, opt, parseDate, normCurrency, normStatus } from "@/lib/import-parse";

export type ImportMode = "create" | "update";
export type ImportRow = Record<string, string>;
export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  callLogsCreated: number;
  unmatchedOperators: string[];
  errors: { row: number; message: string }[];
  unauthorized?: boolean;
};

const MAX_ROWS = 5000;
const NOTE_MAX = 2000;

// Import qilingan aloqa yozuvlari TARIXIY — operatorlar bu mijozlar bilan o'tmishда
// gaplashgan. Jonli tabloda (bugun/hafta/oy) operatorlarni shishirib ko'rsatmasligi
// uchun o'tmishdagi sana bilan yoziladi (analitika oraliqlaridan tashqarida).
// Mijoz tarixida "kim gaplashgani" baribir ko'rinadi.
const IMPORT_CALL_DATE = new Date("2025-01-01T00:00:00.000Z");

/** Import izohini xavfsiz uzunlikka qisqartiradi. */
function clampNote(v?: string): string | null {
  const t = opt(v);
  return t ? t.slice(0, NOTE_MAX) : null;
}

export async function importClients(payload: {
  mode: ImportMode;
  defaultCurrency?: string;
  rows: ImportRow[];
  lines?: number[];
}): Promise<ImportReport> {
  const session = await requireSession();

  const report: ImportReport = {
    created: 0,
    updated: 0,
    skipped: 0,
    callLogsCreated: 0,
    unmatchedOperators: [],
    errors: [],
  };
  if (session.role !== "ADMIN") {
    return { ...report, unauthorized: true };
  }

  const rows = (payload.rows ?? []).slice(0, MAX_ROWS);
  const lines = payload.lines ?? [];
  const fallbackCurrency = payload.defaultCurrency === "UZS" ? "UZS" : "USD";

  // Mavjud mijozlarni telefon (normallashtirilgan) bo'yicha bir so'rovda olamiz
  const existing = await db.client.findMany({ select: { id: true, phone: true } });
  const existingByPhone = new Map<string, string>();
  for (const c of existing) {
    const k = normalizePhone(c.phone);
    if (k && !existingByPhone.has(k)) existingByPhone.set(k, c.id);
  }

  // Operator nomini (TP xodimi) foydalanuvchiga moslash uchun xarita.
  // Ham to'liq ism, ham birinchi so'z bo'yicha qidiriladi ("Abdulla" → "Abdulla Rahimov").
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const userByName = new Map<string, string>();
  for (const u of users) {
    const full = u.name.trim().toLowerCase();
    if (full && !userByName.has(full)) userByName.set(full, u.id);
    const first = full.split(/\s+/)[0];
    if (first && !userByName.has(first)) userByName.set(first, u.id);
  }
  function findOperator(name: string | null): string | undefined {
    if (!name) return undefined;
    const t = name.trim().toLowerCase();
    if (!t) return undefined;
    return userByName.get(t) ?? userByName.get(t.split(/\s+/)[0]);
  }

  // Allaqachon aloqa tarixi (CallLog) bor mijozlar — qayta import qilinganda
  // dublikat yozuv yaratmaslik uchun.
  const withCallLogs = new Set(
    (await db.callLog.findMany({ select: { clientId: true }, distinct: ["clientId"] })).map(
      (c) => c.clientId,
    ),
  );

  const seen = new Set<string>();
  const unmatched = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const reportRow = lines[i] ?? i + 1;

    const fullName = (raw.fullName ?? "").trim();
    const restaurantName = (raw.restaurantName ?? "").trim();
    const phone = (raw.phone ?? "").trim();

    if (!fullName || !restaurantName || !phone) {
      report.skipped += 1;
      report.errors.push({
        row: reportRow,
        message: "FIO, restoran nomi yoki telefon to'ldirilmagan",
      });
      continue;
    }

    const phoneKey = normalizePhone(phone);
    if (phoneKey && seen.has(phoneKey)) {
      report.skipped += 1;
      report.errors.push({
        row: reportRow,
        message: "Telefon CSV ichida takrorlangan",
      });
      continue;
    }
    if (phoneKey) seen.add(phoneKey);

    const extra = opt(raw.phoneSecondary);
    const extraPhone = extra ? { label: "Qo'shimcha", number: extra } : null;

    // Operator (TP xodimi) va izoh — aloqa tarixi yaratish uchun
    const operatorName = opt(raw.operator);
    const operatorId = findOperator(operatorName);
    if (operatorName && !operatorId) unmatched.add(operatorName);
    const note = clampNote(raw.notes);

    const data = {
      fullName,
      restaurantName,
      phone,
      region: normalizeRegion(opt(raw.region)),
      contractNumber: opt(raw.contractNumber),
      contractDate: parseDate(raw.contractDate),
      installerName: opt(raw.installerName),
      monoblokCount: Math.max(0, Math.round(num(raw.monoblokCount) ?? 1)),
      equipment: opt(raw.equipment),
      monthlyAmount: num(raw.monthlyAmount) ?? 0,
      currency: normCurrency(raw.currency, fallbackCurrency),
      nextPaymentDate: parseDate(raw.nextPaymentDate),
      status: normStatus(raw.status),
      notes: note,
    };

    try {
      const existingId = phoneKey ? existingByPhone.get(phoneKey) : undefined;
      let clientId: string | null = null;

      if (payload.mode === "update") {
        if (existingId) {
          await db.client.update({ where: { id: existingId }, data });
          clientId = existingId;
          report.updated += 1;
        } else {
          const c = await db.client.create({
            data: { ...data, phones: extraPhone ? { create: [extraPhone] } : undefined },
          });
          clientId = c.id;
          if (phoneKey) existingByPhone.set(phoneKey, c.id);
          report.created += 1;
        }
      } else {
        // create rejimi: mavjud telefonni o'tkazib yuborib, dublikatni oldini olamiz
        if (existingId) {
          report.skipped += 1;
          report.errors.push({
            row: reportRow,
            message: "Bu telefon bazada allaqachon mavjud",
          });
        } else {
          const c = await db.client.create({
            data: { ...data, phones: extraPhone ? { create: [extraPhone] } : undefined },
          });
          clientId = c.id;
          if (phoneKey) existingByPhone.set(phoneKey, c.id);
          report.created += 1;
        }
      }

      // Operator topilgan bo'lsa — "kim gaplashgani" aloqa tarixiga yoziladi.
      // Mijozda hali aloqa tarixi bo'lmasa (qayta import dublikatining oldini olish).
      if (clientId && operatorId && !withCallLogs.has(clientId)) {
        await db.callLog.create({
          data: {
            clientId,
            operatorId,
            result: "TALKED",
            note,
            calledAt: IMPORT_CALL_DATE,
          },
        });
        withCallLogs.add(clientId);
        report.callLogsCreated += 1;
      }
    } catch {
      report.skipped += 1;
      report.errors.push({ row: reportRow, message: "Bazaga saqlashda xatolik" });
    }
  }

  report.unmatchedOperators = [...unmatched];

  revalidatePath("/mijozlar");
  revalidatePath("/");
  revalidatePath("/hisobot");
  return report;
}

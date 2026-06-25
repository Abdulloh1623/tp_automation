"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";
import { num, opt, parseDate, normCurrency, normStatus } from "@/lib/import-parse";

export type ImportMode = "create" | "update";
export type ImportRow = Record<string, string>;
export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  unauthorized?: boolean;
};

const MAX_ROWS = 5000;

export async function importClients(payload: {
  mode: ImportMode;
  defaultCurrency?: string;
  rows: ImportRow[];
  lines?: number[];
}): Promise<ImportReport> {
  const session = await requireSession();

  const report: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [] };
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

  const seen = new Set<string>();

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
    const data = {
      fullName,
      restaurantName,
      phone,
      region: opt(raw.region),
      contractNumber: opt(raw.contractNumber),
      contractDate: parseDate(raw.contractDate),
      installerName: opt(raw.installerName),
      monoblokCount: Math.max(0, Math.round(num(raw.monoblokCount) ?? 1)),
      equipment: opt(raw.equipment),
      monthlyAmount: num(raw.monthlyAmount) ?? 0,
      currency: normCurrency(raw.currency, fallbackCurrency),
      nextPaymentDate: parseDate(raw.nextPaymentDate),
      status: normStatus(raw.status),
    };

    try {
      const existingId = phoneKey ? existingByPhone.get(phoneKey) : undefined;
      if (payload.mode === "update") {
        if (existingId) {
          await db.client.update({ where: { id: existingId }, data });
          report.updated += 1;
        } else {
          const c = await db.client.create({
            data: { ...data, phones: extraPhone ? { create: [extraPhone] } : undefined },
          });
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
          if (phoneKey) existingByPhone.set(phoneKey, c.id);
          report.created += 1;
        }
      }
    } catch {
      report.skipped += 1;
      report.errors.push({ row: reportRow, message: "Bazaga saqlashda xatolik" });
    }
  }

  revalidatePath("/mijozlar");
  revalidatePath("/");
  revalidatePath("/hisobot");
  return report;
}

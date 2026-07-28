"use server";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ENTITIES, isBulkEntity, type BulkEntityKey } from "@/lib/bulk/entities";
import { parseRows, phoneKey } from "@/lib/bulk/parse";
import { readUploadedTable } from "@/lib/bulk/template";
import {
  resolvePayment,
  resolveEquipment,
  resolveStaff,
  generatePassword,
  type Lookups,
  type RowResult,
} from "@/lib/bulk/validate";
import { importClients } from "@/actions/import";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

const STAGING_DIR = path.join(process.cwd(), "uploads", "bulk");
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 5000;

export type PreviewIssue = { line: number; kind: "error" | "skip"; message: string };

export type PreviewState = {
  ok?: boolean;
  error?: string;
  entity?: BulkEntityKey;
  token?: string;
  fileName?: string;
  /** Yozishga tayyor qatorlar soni. */
  ready?: number;
  issues?: PreviewIssue[];
  /** Fayldagi notanish ustunlar (e'tiborsiz qoldiriladi). */
  unknownColumns?: string[];
};

export type CommitState = {
  ok?: boolean;
  error?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  /** Faqat xodimlar uchun — bir marta ko'rsatiladigan parollar. */
  credentials?: { name: string; username: string; password: string }[];
  message?: string;
};

async function requireAdmin() {
  return guardRole(["ADMIN"]);
}

function stagingPath(token: string): string | null {
  return /^[a-f0-9]{32}$/.test(token) ? path.join(STAGING_DIR, `${token}.json`) : null;
}

/** Qidiruv indekslarini bazadan yig'adi. */
async function buildLookups(): Promise<Lookups> {
  const [clients, types, users] = await Promise.all([
    db.client.findMany({
      select: { id: true, phone: true, contractNumber: true, restaurantName: true, currency: true },
    }),
    db.equipmentType.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ select: { username: true } }),
  ]);

  const byPhone = new Map<string, string>();
  const byContract = new Map<string, string>();
  const byName = new Map<string, string | null>();
  const clientCurrency = new Map<string, string>();

  for (const c of clients) {
    clientCurrency.set(c.id, c.currency);
    const pk = phoneKey(c.phone ?? "");
    if (pk && !byPhone.has(pk)) byPhone.set(pk, c.id);
    if (c.contractNumber) byContract.set(c.contractNumber.trim().toLowerCase(), c.id);
    const nm = c.restaurantName.trim().toLowerCase();
    // Bir xil nomli ikkinchi mijoz uchrasa — null qo'yamiz (noaniq).
    byName.set(nm, byName.has(nm) ? null : c.id);
  }

  return {
    byPhone,
    byContract,
    byName,
    equipmentTypes: new Map(types.map((t) => [t.name.trim().toLowerCase(), t.id])),
    usernames: new Set(users.map((u) => u.username.toLowerCase())),
    clientCurrency,
  };
}

/** 1-BOSQICH: faylni o'qib tekshiradi va yozishga tayyorlaydi. */
export async function previewBulk(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const g = await requireAdmin();
  if (!g.ok) return { error: g.error };

  const entityRaw = String(formData.get("entity") ?? "");
  if (!isBulkEntity(entityRaw)) return { error: "Tur noto'g'ri" };
  const entity = entityRaw;
  const def = ENTITIES[entity];

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Fayl tanlanmagan", entity };
  if (file.size > MAX_BYTES) return { error: "Fayl 20MB dan katta", entity };

  const table = await readUploadedTable(Buffer.from(await file.arrayBuffer()), file.name);
  if (!table.ok) return { error: table.error, entity };

  const { headers, rows } = parseRows(def, table.table);
  if (headers.missingRequired.length > 0) {
    return {
      entity,
      error:
        `Fayl shablonga mos emas — bu ustunlar topilmadi: ${headers.missingRequired.join(", ")}. ` +
        `Shablonni yuklab olib, sarlavha qatorini o'zgartirmasdan to'ldiring.`,
    };
  }
  if (rows.length === 0) return { error: "Faylda ma'lumot yo'q", entity };
  if (rows.length > MAX_ROWS) {
    return { error: `Juda ko'p qator (${rows.length}). Chegara ${MAX_ROWS} — faylni bo'lib yuklang.`, entity };
  }

  const lk = await buildLookups();
  const issues: PreviewIssue[] = [];
  let records: unknown[] = [];

  if (entity === "mijozlar") {
    // Mijozlar uchun mavjud import mantiqini qayta ishlatamiz — u o'zi
    // to'liq tekshiradi va hisobot beradi. Bu yerda faqat qatorlarni beramiz.
    records = rows.map((r) => r.values);
    for (const r of rows) {
      if (r.errors.length) issues.push({ line: r.line, kind: "error", message: r.errors.join("; ") });
    }
  } else {
    const seen = new Set<string>();
    const resolved = rows.map((r): RowResult<unknown> => {
      if (entity === "tolovlar") return resolvePayment(r, lk);
      if (entity === "uskuna") return resolveEquipment(r, lk);
      return resolveStaff(r, lk, seen);
    });
    for (const res of resolved) {
      if (res.status === "ok") records.push(res.record);
      else issues.push({ line: res.line, kind: res.status, message: res.message });
    }
  }

  const ready = entity === "mijozlar" ? rows.length - issues.filter((i) => i.kind === "error").length : records.length;
  if (ready === 0) {
    return { entity, error: "Yozishga yaroqli qator yo'q — quyidagi xatolarni tuzating", issues: issues.slice(0, 100) };
  }

  const token = randomUUID().replace(/-/g, "");
  await fs.mkdir(STAGING_DIR, { recursive: true });
  await fs.writeFile(
    path.join(STAGING_DIR, `${token}.json`),
    JSON.stringify({ entity, records }),
    "utf8",
  );

  return {
    ok: true,
    entity,
    token,
    fileName: file.name,
    ready,
    issues: issues.slice(0, 100),
    unknownColumns: headers.unknown,
  };
}

/** 2-BOSQICH: tayyorlangan qatorlarni bazaga yozadi. */
export async function commitBulk(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const g = await requireAdmin();
  if (!g.ok) return { error: g.error };

  const token = String(formData.get("token") ?? "");
  const file = stagingPath(token);
  if (!file) return { error: "Token noto'g'ri — faylni qaytadan tekshiring" };

  let staged: { entity: BulkEntityKey; records: unknown[] };
  try {
    staged = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return { error: "Tayyorlangan ma'lumot topilmadi — jarayonni qaytadan boshlang" };
  }
  await fs.rm(file, { force: true }).catch(() => {});

  const { entity, records } = staged;
  try {
    if (entity === "mijozlar") {
      const report = await importClients({
        mode: "create",
        rows: records as Record<string, string>[],
      });
      await logAudit("Ommaviy yuklash: mijozlar", {
        entity: "Client",
        detail: `yangi ${report.created}, yangilandi ${report.updated}, o'tkazildi ${report.skipped}`,
      });
      revalidatePath("/mijozlar");
      return { ok: true, created: report.created, updated: report.updated, skipped: report.skipped };
    }

    if (entity === "tolovlar") return await commitPayments(records as never);
    if (entity === "uskuna") return await commitEquipment(records as never);
    return await commitStaff(records as never);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------

type PaymentRec = { clientId: string; amount: number; currency: string; paidAt: string | Date; method: string | null; note: string | null };

async function commitPayments(records: PaymentRec[]): Promise<CommitState> {
  // Takrorni oldini olish: bir xil mijoz + sana + summa allaqachon bo'lsa
  // qayta yozilmaydi (fayl ikki marta yuklansa ham bazani buzmaydi).
  const existing = await db.payment.findMany({
    select: { clientId: true, amount: true, paidAt: true },
  });
  const key = (clientId: string, amount: number, d: Date) =>
    `${clientId}|${amount}|${d.toISOString().slice(0, 10)}`;
  const seen = new Set(existing.map((p) => key(p.clientId, p.amount, p.paidAt)));

  const toCreate = [];
  let skipped = 0;
  for (const r of records) {
    const paidAt = new Date(r.paidAt);
    const k = key(r.clientId, r.amount, paidAt);
    if (seen.has(k)) {
      skipped++;
      continue;
    }
    seen.add(k);
    toCreate.push({
      clientId: r.clientId,
      amount: r.amount,
      currency: r.currency,
      paidAt,
      method: r.method,
      // Chek YO'Q — bu ataylab, tarixiy ma'lumot. Izohda shu qayd etiladi.
      receiptNote: r.note ? `Ommaviy yuklash: ${r.note}` : "Ommaviy yuklash (cheksiz, tarixiy)",
    });
  }

  if (toCreate.length) await db.payment.createMany({ data: toCreate });
  await logAudit("Ommaviy yuklash: to'lovlar", {
    entity: "Payment",
    detail: `${toCreate.length} ta to'lov (CHEKSIZ, tarixiy), ${skipped} ta takror o'tkazildi`,
  });
  revalidatePath("/tolovlar");
  return {
    ok: true,
    created: toCreate.length,
    skipped,
    message: "To'lovlar chek biriktirilmasdan yozildi (tarixiy). Cheklar keyin qo'lda qo'shiladi.",
  };
}

type EqRec = { clientId: string; equipmentTypeId: string; quantity: number; ownership: string };

async function commitEquipment(records: EqRec[]): Promise<CommitState> {
  const existing = await db.clientEquipment.findMany({
    select: { id: true, clientId: true, equipmentTypeId: true, ownership: true, quantity: true },
  });
  const map = new Map(existing.map((e) => [`${e.clientId}|${e.equipmentTypeId}|${e.ownership}`, e]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const touched = new Set<string>();

  await db.$transaction(async (tx) => {
    for (const r of records) {
      const ex = map.get(`${r.clientId}|${r.equipmentTypeId}|${r.ownership}`);
      if (ex) {
        if (ex.quantity === r.quantity) {
          skipped++;
          continue;
        }
        if (r.quantity === 0) await tx.clientEquipment.delete({ where: { id: ex.id } });
        else await tx.clientEquipment.update({ where: { id: ex.id }, data: { quantity: r.quantity } });
        updated++;
      } else {
        if (r.quantity === 0) {
          skipped++;
          continue;
        }
        await tx.clientEquipment.create({
          data: {
            clientId: r.clientId,
            equipmentTypeId: r.equipmentTypeId,
            quantity: r.quantity,
            ownership: r.ownership,
          },
        });
        created++;
      }
      touched.add(r.clientId);
    }

    // equipmentMode mijozning uskunasidan kelib chiqadi (actions/equipment.ts
    // dagi qoida bilan bir xil).
    for (const clientId of touched) {
      const items = await tx.clientEquipment.findMany({
        where: { clientId, quantity: { gt: 0 } },
        select: { ownership: true },
      });
      const mode = items.some((i) => i.ownership === "RENTAL")
        ? "RENTAL"
        : items.some((i) => i.ownership === "SOLD")
          ? "SOLD"
          : "PROGRAM_ONLY";
      await tx.client.update({ where: { id: clientId }, data: { equipmentMode: mode } });
    }
  });

  await logAudit("Ommaviy yuklash: uskuna", {
    entity: "Client",
    detail: `yangi ${created}, yangilandi ${updated}, o'zgarishsiz ${skipped} — ${touched.size} mijoz`,
  });
  revalidatePath("/ombor");
  revalidatePath("/uskuna-analitika");
  return { ok: true, created, updated, skipped };
}

type StaffRec = {
  name: string;
  username: string | null;
  role: string;
  phone: string | null;
  regions: string[];
  shift: string;
  dailyLeadTarget: number | null;
};

async function commitStaff(records: StaffRec[]): Promise<CommitState> {
  const credentials: { name: string; username: string; password: string }[] = [];
  let created = 0;

  for (const r of records) {
    // Usta (INSTALLER) tizimga kirmaydi — login/parol yaratilmaydi.
    // Prisma `username` majburiy bo'lgani uchun ularga texnik qiymat beriladi.
    const isInstaller = r.role === "INSTALLER";
    const password = generatePassword();
    const username = r.username ?? `usta-${randomUUID().slice(0, 8)}`;

    await db.user.create({
      data: {
        name: r.name,
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: r.role,
        phone: r.phone,
        region: r.regions[0] ?? null,
        regions: r.regions.length ? r.regions.join(",") : null,
        shift: r.shift,
        // Shablondagi "Kunlik lid rejasi" ustuni — endi yagona kvota maydoniga
        // yoziladi (import kaliti mavjud fayllar buzilmasin uchun o'zgarmadi).
        dailyLimit: r.dailyLeadTarget,
      },
    });
    created++;
    if (!isInstaller) credentials.push({ name: r.name, username, password });
  }

  await logAudit("Ommaviy yuklash: xodimlar", {
    entity: "User",
    detail: `${created} ta xodim qo'shildi (${credentials.length} tasiga login yaratildi)`,
  });
  revalidatePath("/foydalanuvchilar");
  revalidatePath("/ustalar");
  return {
    ok: true,
    created,
    credentials,
    message:
      credentials.length > 0
        ? `Parollar BIR MARTA ko'rsatiladi (har biri ${MIN_PASSWORD_LENGTH}+ belgi) — nusxa oling.`
        : undefined,
  };
}

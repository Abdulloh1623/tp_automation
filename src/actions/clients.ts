"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { resolveAssignee } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { normalizeRegion } from "@/lib/constants";
import { computeNextPaymentDate } from "@/lib/billing";
import {
  clientStatusEnum,
  currencyEnum,
  noteString,
  requireActivePaymentDate,
  toFieldErrors,
} from "@/lib/validation";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const clientSchema = z.object({
  fullName: z.string().min(1, "FIO kiriting"),
  restaurantName: z.string().min(1, "Restoran nomini kiriting"),
  region: z.string().optional(),
  phone: z.string().min(1, "Telefon raqamini kiriting"),
  contractNumber: z.string().optional(),
  contractDate: z.string().optional(),
  installerName: z.string().optional(),
  monoblokCount: z.coerce.number().int().min(0).default(1),
  equipment: z.string().optional(),
  status: clientStatusEnum.default("ACTIVE"),
  monthlyAmount: z.coerce.number().min(0).default(0),
  currency: currencyEnum.default("USD"),
  nextPaymentDate: z.string().optional(),
  debtAmount: z.coerce.number().min(0).default(0),
  notes: noteString.optional(),
  assignedToId: z.string().optional(),
}).superRefine(requireActivePaymentDate);

export type ClientFormState = { error?: string; fieldErrors?: Record<string, string> };

/** Formadagi takrorlanuvchi phoneLabel/phoneNumber juftliklarini o'qiydi. */
function parsePhones(formData: FormData): { label: string; number: string }[] {
  const labels = formData.getAll("phoneLabel").map(String);
  const numbers = formData.getAll("phoneNumber").map(String);
  const out: { label: string; number: string }[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const number = (numbers[i] ?? "").trim();
    // Raqamsiz yoki juda qisqa (masalan faqat "+998" prefiksi qolgan) qator
    // saqlanmaydi — telefon input default "+998 " qo'yadi, uni junk qilmaymiz.
    if (number.replace(/\D/g, "").length < 7) continue;
    out.push({ label: (labels[i] ?? "").trim() || "Boshqa", number });
  }
  return out;
}

function parseForm(formData: FormData) {
  const status = s(formData.get("status")) ?? "ACTIVE";
  const contractDate = s(formData.get("contractDate"));
  let nextPaymentDate = s(formData.get("nextPaymentDate"));

  // Faol mijozga to'lov sanasi kiritilmagan, ammo shartnoma sanasi bor bo'lsa —
  // uni shartnoma kunidan avtomatik hisoblaymiz (to'lov sanasi hech qachon bo'sh
  // qolmasligi kerak). Shartnoma sanasi ham bo'lmasa — pastdagi Zod tekshiruvi
  // (`requireActivePaymentDate`) xato qaytaradi.
  if (status === "ACTIVE" && !nextPaymentDate && contractDate) {
    const anchor = new Date(contractDate);
    if (!Number.isNaN(anchor.getTime())) {
      nextPaymentDate = computeNextPaymentDate(anchor).toISOString().slice(0, 10);
    }
  }

  return clientSchema.safeParse({
    fullName: s(formData.get("fullName")),
    restaurantName: s(formData.get("restaurantName")),
    region: s(formData.get("region")),
    phone: s(formData.get("phone")),
    contractNumber: s(formData.get("contractNumber")),
    contractDate,
    installerName: s(formData.get("installerName")),
    monoblokCount: s(formData.get("monoblokCount")) ?? 1,
    equipment: s(formData.get("equipment")),
    status,
    monthlyAmount: s(formData.get("monthlyAmount")) ?? 0,
    currency: s(formData.get("currency")) ?? "USD",
    nextPaymentDate,
    debtAmount: s(formData.get("debtAmount")) ?? 0,
    notes: s(formData.get("notes")),
    assignedToId: s(formData.get("assignedToId")),
  });
}

function toData(parsed: z.infer<typeof clientSchema>) {
  return {
    fullName: parsed.fullName,
    restaurantName: parsed.restaurantName,
    region: normalizeRegion(parsed.region),
    phone: parsed.phone,
    contractNumber: parsed.contractNumber ?? null,
    contractDate: parsed.contractDate ? new Date(parsed.contractDate) : null,
    installerName: parsed.installerName ?? null,
    monoblokCount: parsed.monoblokCount,
    equipment: parsed.equipment ?? null,
    status: parsed.status,
    monthlyAmount: parsed.monthlyAmount,
    currency: parsed.currency,
    nextPaymentDate: parsed.nextPaymentDate
      ? new Date(parsed.nextPaymentDate)
      : null,
    debtAmount: parsed.debtAmount,
    notes: parsed.notes ?? null,
    assignedToId: parsed.assignedToId ?? null,
  };
}

type ClientData = ReturnType<typeof toData>;

/**
 * Mijoz yozuvidagi o'zgargan maydonlarni (eski -> yangi) audit uchun hisoblaydi.
 * Faqat haqiqatan o'zgargan maydonlar qaytadi; sanalar YYYY-MM-DD ko'rinishida,
 * telefonlar to'plami (yorliq+raqam) imzosi bo'yicha solishtiriladi.
 */
function diffClient(
  before: ClientData & { phones: { label: string; number: string }[] },
  after: ClientData,
  newPhones: { label: string; number: string }[],
): Record<string, { from: unknown; to: unknown }> {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const cmp = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes[field] = { from, to };
  };

  cmp("fullName", before.fullName, after.fullName);
  cmp("restaurantName", before.restaurantName, after.restaurantName);
  cmp("region", before.region, after.region);
  cmp("phone", before.phone, after.phone);
  cmp("contractNumber", before.contractNumber, after.contractNumber);
  cmp("contractDate", day(before.contractDate), day(after.contractDate));
  cmp("installerName", before.installerName, after.installerName);
  cmp("monoblokCount", before.monoblokCount, after.monoblokCount);
  cmp("equipment", before.equipment, after.equipment);
  cmp("status", before.status, after.status);
  cmp("monthlyAmount", before.monthlyAmount, after.monthlyAmount);
  cmp("currency", before.currency, after.currency);
  cmp("nextPaymentDate", day(before.nextPaymentDate), day(after.nextPaymentDate));
  cmp("debtAmount", before.debtAmount, after.debtAmount);
  cmp("notes", before.notes, after.notes);
  cmp("assignedToId", before.assignedToId, after.assignedToId);

  const sig = (ps: { label: string; number: string }[]) =>
    ps.map((p) => `${p.label}:${p.number}`).sort().join("|");
  if (sig(before.phones) !== sig(newPhones)) {
    changes.phones = { from: before.phones, to: newPhones };
  }

  return changes;
}

export async function createClient(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      error: "Maʼlumotlarni tekshiring",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  const phones = parsePhones(formData);
  // assignedToId xavfsiz aniqlanadi (OPERATOR doimo o'ziga; ADMIN/MANAGER validatsiya bilan)
  const assignedToId = await resolveAssignee(g.session, parsed.data.assignedToId);
  const created = await db.client.create({
    data: { ...toData(parsed.data), assignedToId, phones: { create: phones } },
  });

  // Oxirgi (boshlang'ich) to'lov — oldindan mavjud mijoz uchun ixtiyoriy: bitta
  // tarixiy Payment yoziladi. Tarixiy bo'lgani uchun chek MAJBURIY emas.
  const payAmount = Number(s(formData.get("lastPaymentAmount")) ?? "");
  const payDate = s(formData.get("lastPaymentDate"));
  if (Number.isFinite(payAmount) && payAmount > 0) {
    const paidAt = payDate ? new Date(payDate) : null;
    await db.payment.create({
      data: {
        clientId: created.id,
        amount: payAmount,
        currency: created.currency,
        paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : undefined,
        receiptNote: "Boshlang'ich to'lov (oldindan mavjud mijoz)",
        recordedById: g.session.userId,
      },
    });
  }

  await logAudit("Mijoz qo'shildi", {
    entity: "Client",
    entityId: created.id,
    detail: created.restaurantName,
  });
  revalidatePath("/mijozlar");
  redirect(`/mijozlar/${created.id}`);
}

export async function updateClient(
  id: string,
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };

  // Egalik cheklovi ATAYIN olib tashlandi: ISTALGAN staff roli (ADMIN/MANAGER/
  // OPERATOR) istalgan mijozni tahrirlashi mumkin (`canMutateClient` bu yerda
  // qo'llanmaydi). Buning evaziga kim, qaysi mijozda, NIMANI o'zgartirgani
  // (eski -> yangi) to'liq AuditLog'ga yoziladi (quyida). Mavjudlik baribir
  // tekshiriladi + eski qiymatlar diff uchun o'qib olinadi.
  const before = await db.client.findUnique({
    where: { id },
    include: { phones: { select: { label: true, number: true } } },
  });
  if (!before) return { error: "Mijoz topilmadi" };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      error: "Maʼlumotlarni tekshiring",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  const phones = parsePhones(formData);

  // Biriktiruv: ADMIN/MANAGER formadagi qiymatni (validatsiya bilan) o'zgartira
  // oladi. OPERATOR esa boshqaning mijozini tahrirlaganda uni O'ZIGA "o'g'irlab"
  // olmasligi uchun mavjud biriktiruv saqlanadi (resolveAssignee OPERATOR uchun
  // doim o'zini qaytaradi — bu yerda unga tayanmaymiz).
  const assignedToId =
    g.session.role === "OPERATOR"
      ? before.assignedToId
      : await resolveAssignee(g.session, parsed.data.assignedToId);

  const after = { ...toData(parsed.data), assignedToId };

  await db.client.update({
    where: { id },
    data: { ...after, phones: { deleteMany: {}, create: phones } },
  });

  // Har bir tahrir AuditLog'ga: kim (userId — logAudit sessiyadan oladi), qaysi
  // mijoz (entityId), va nima o'zgargani (eski -> yangi JSON) yoziladi.
  const changes = diffClient(before, after, phones);
  await logAudit("CLIENT_UPDATE", {
    entity: "Client",
    entityId: id,
    detail: JSON.stringify({
      restaurantName: parsed.data.restaurantName,
      editorRole: g.session.role,
      fields: Object.keys(changes),
      changes,
    }),
  });

  revalidatePath("/mijozlar");
  revalidatePath(`/mijozlar/${id}`);
  redirect(`/mijozlar/${id}`);
}

/** "To'ldirilmagan" sahifasida joyida tezkor to'ldirish (restoran nomi / telefon / viloyat). */
export async function quickCompleteClient(
  id: string,
  data: { restaurantName?: string; phone?: string; region?: string },
): Promise<{ ok: boolean; error?: string }> {
  // "To'ldirilmagan" ro'yxatidagi mijozni ISTAGAN xodim to'ldira oladi (egalik
  // tekshiruvi yo'q) — lekin kim, nimani to'ldirgani audit jurnaliga yoziladi.
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };
  const patch: { restaurantName?: string; phone?: string; region?: string | null } = {};
  // Faqat bo'sh bo'lmagan qiymatni yozamiz — mavjud qiymatni bo'sh bilan o'chirib
  // qo'ymaslik va "to'ldirilmagan" holatini qayta yaratmaslik uchun.
  const rn = data.restaurantName?.trim();
  if (rn) patch.restaurantName = rn;
  const ph = data.phone?.trim();
  if (ph) patch.phone = ph;
  if (data.region !== undefined) patch.region = normalizeRegion(data.region);
  if (Object.keys(patch).length === 0) return { ok: false, error: "O'zgarish yo'q" };
  await db.client.update({ where: { id }, data: patch });
  const changed = Object.entries(patch)
    .map(([k, v]) => `${k}=${v ?? "—"}`)
    .join(", ");
  await logAudit("Mijoz ma'lumoti to'ldirildi", {
    entity: "Client",
    entityId: id,
    detail: changed,
  });
  revalidatePath("/toldirilmagan");
  revalidatePath("/mijozlar");
  return { ok: true };
}

/**
 * Mijozni "Otkaz" (xizmatdan voz kechgan) deb belgilash — mijoz kartochkasidan
 * (`/mijozlar/[id]`) chaqiriladi.
 *
 * MUHIM: `quickCompleteClient` kabi bu ham egalik tekshiruvidan (`canMutateClient`)
 * ATAYIN ISTISNO — ISTAGAN xodim (ADMIN/OPERATOR/MANAGER) mijozni otkaz qila oladi,
 * lekin kim, qaysi mijozni belgilagani AuditLog'ga to'liq yoziladi. Belgilangach
 * mijoz kunlik ish taxtasi (`/lidlar`) va faol ro'yxatlardan butunlay chiqadi
 * (stage=REFUSED, status=INACTIVE, assignedToId va pendingStage tozalanadi).
 */
export async function refuseClient(
  clientId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };

  // Otkaz — izoh (sabab) MAJBURIY: nima uchun voz kechgani tarixda qolishi shart.
  const note = (reason ?? "").trim().slice(0, 2000);
  if (!note) return { ok: false, error: "Otkaz uchun izoh (sabab) majburiy" };

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, restaurantName: true, stage: true },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };
  if (client.stage === "REFUSED") {
    return { ok: false, error: "Mijoz allaqachon otkazda" };
  }

  // Otkaz + nofaol qilamiz va kunlik ish holatini butunlay tozalaymiz, shunda
  // mijoz na taxtada, na overdue qarzdorlar oqimida qayta paydo bo'lmaydi.
  await db.client.update({
    where: { id: clientId },
    data: {
      stage: "REFUSED",
      status: "INACTIVE",
      assignedToId: null,
      pendingStage: null,
      lastOutcome: "REFUSED",
      lastContactedAt: new Date(),
      missedCallCount: 0,
      nextContactDate: null,
    },
  });

  // Sabab /otkaz sahifasida "Sabab" bo'lib ko'rinishi uchun oxirgi izohli CallLog.
  await db.callLog.create({
    data: {
      clientId,
      result: "REFUSED",
      note,
      operatorId: g.session.userId,
    },
  });

  await logAudit("Mijoz otkaz qilindi (kartochkadan)", {
    entity: "Client",
    entityId: clientId,
    detail: note ? `${client.restaurantName}: ${note}` : client.restaurantName,
  });

  revalidatePath("/lidlar");
  revalidatePath("/mijozlar");
  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/otkaz");
  revalidatePath("/");
  return { ok: true };
}

/** Bir nechta mijozni operatorga (yoki bo'sh — biriktirilmagan) ommaviy biriktirish. */
export async function bulkAssignOperator(
  clientIds: string[],
  operatorId: string | null,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };
  const ids = (clientIds ?? []).filter((x) => typeof x === "string" && x);
  if (ids.length === 0) return { ok: false, error: "Mijoz tanlanmadi" };

  let opName = "—";
  if (operatorId) {
    const op = await db.user.findFirst({
      where: {
        id: operatorId,
        role: { in: ["OPERATOR", "ADMIN", "MANAGER"] },
        isActive: true,
      },
      select: { name: true, role: true, dailyLimit: true },
    });
    if (!op) return { ok: false, error: "Operator topilmadi yoki mos rol emas" };
    opName = op.name;

    // Kvota nazorati — faqat OPERATOR uchun. Limit to'lgan bo'lsa oddiy biriktirish bloklanadi;
    // limitdan tashqari biriktirish uchun `assignExtraClient` (Qo'shimcha biriktirish) ishlatiladi.
    if (op.role === "OPERATOR") {
      const activeCount = await db.client.count({
        where: { assignedToId: operatorId, status: "ACTIVE" },
      });
      if (activeCount >= op.dailyLimit) {
        return {
          ok: false,
          error: `Limit to'ldi (${activeCount}/${op.dailyLimit}). "Qo'shimcha biriktirish"dan foydalaning.`,
        };
      }
    }
  }

  const res = await db.client.updateMany({
    where: { id: { in: ids } },
    data: { assignedToId: operatorId },
  });
  await logAudit("Mijozlar operatorga biriktirildi", {
    entity: "Client",
    detail: `${res.count} ta -> ${operatorId ? opName : "biriktirilmagan"}`,
  });
  revalidatePath("/mijozlar");
  revalidatePath("/lidlar");
  return { ok: true, count: res.count };
}

/**
 * Qo'shimcha biriktirish — kunlik limitni ATAYLAB chetlab o'tib, operatorga bitta
 * qo'shimcha mijoz biriktiradi. Faqat ADMIN/MANAGER; audit izi majburiy qoldiriladi.
 */
export async function assignExtraClient(
  userId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };
  if (!userId || !clientId) return { ok: false, error: "Operator yoki mijoz tanlanmadi" };

  const op = await db.user.findFirst({
    where: { id: userId, role: { in: ["OPERATOR", "ADMIN", "MANAGER"] }, isActive: true },
    select: { name: true, dailyLimit: true },
  });
  if (!op) return { ok: false, error: "Operator topilmadi yoki mos rol emas" };

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { restaurantName: true },
  });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };

  const activeCount = await db.client.count({
    where: { assignedToId: userId, status: "ACTIVE" },
  });

  await db.client.update({ where: { id: clientId }, data: { assignedToId: userId } });

  // Limitdan tashqari biriktirish — audit izida aniq belgilanadi
  await logAudit("Qo'shimcha biriktirish (limitdan tashqari)", {
    entity: "Client",
    entityId: clientId,
    detail: `${client.restaurantName} → ${op.name} (${activeCount + 1}/${op.dailyLimit}, limit chetlab o'tildi)`,
  });

  revalidatePath("/tablo");
  revalidatePath("/analitika");
  revalidatePath("/mijozlar");
  revalidatePath("/lidlar");
  return { ok: true };
}

/**
 * "Qo'shimcha biriktirish" tanlagichi uchun biriktirilmagan faol mijozlar ro'yxati.
 * Faqat ADMIN/MANAGER; ro'yxat qisqartiriladi (tez tanlash uchun).
 */
export async function listAssignableClients(): Promise<
  { id: string; restaurantName: string; fullName: string }[]
> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return [];
  return db.client.findMany({
    where: { assignedToId: null, status: "ACTIVE" },
    select: { id: true, restaurantName: true, fullName: true },
    orderBy: { restaurantName: "asc" },
    take: 200,
  });
}

export async function deleteClient(id: string): Promise<void> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) redirect("/mijozlar"); // ruxsatsiz — o'chirilmaydi
  const removed = await db.client.delete({ where: { id } });
  await logAudit("Mijoz o'chirildi", {
    entity: "Client",
    entityId: id,
    detail: removed.restaurantName,
  });
  revalidatePath("/mijozlar");
  redirect("/mijozlar");
}

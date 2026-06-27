"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient, resolveAssignee } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { normalizeRegion } from "@/lib/constants";
import { clientStatusEnum, currencyEnum, noteString, toFieldErrors } from "@/lib/validation";

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
  notes: noteString.optional(),
  assignedToId: z.string().optional(),
});

export type ClientFormState = { error?: string; fieldErrors?: Record<string, string> };

/** Formadagi takrorlanuvchi phoneLabel/phoneNumber juftliklarini o'qiydi. */
function parsePhones(formData: FormData): { label: string; number: string }[] {
  const labels = formData.getAll("phoneLabel").map(String);
  const numbers = formData.getAll("phoneNumber").map(String);
  const out: { label: string; number: string }[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const number = (numbers[i] ?? "").trim();
    if (!number) continue; // raqamsiz qator saqlanmaydi
    out.push({ label: (labels[i] ?? "").trim() || "Boshqa", number });
  }
  return out;
}

function parseForm(formData: FormData) {
  return clientSchema.safeParse({
    fullName: s(formData.get("fullName")),
    restaurantName: s(formData.get("restaurantName")),
    region: s(formData.get("region")),
    phone: s(formData.get("phone")),
    contractNumber: s(formData.get("contractNumber")),
    contractDate: s(formData.get("contractDate")),
    installerName: s(formData.get("installerName")),
    monoblokCount: s(formData.get("monoblokCount")) ?? 1,
    equipment: s(formData.get("equipment")),
    status: s(formData.get("status")) ?? "ACTIVE",
    monthlyAmount: s(formData.get("monthlyAmount")) ?? 0,
    currency: s(formData.get("currency")) ?? "USD",
    nextPaymentDate: s(formData.get("nextPaymentDate")),
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
    notes: parsed.notes ?? null,
    assignedToId: parsed.assignedToId ?? null,
  };
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
  if (!(await canMutateClient(g.session, id))) {
    return { error: "Bu mijoz sizga biriktirilmagan" };
  }
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      error: "Maʼlumotlarni tekshiring",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  const phones = parsePhones(formData);
  const assignedToId = await resolveAssignee(g.session, parsed.data.assignedToId);
  await db.client.update({
    where: { id },
    data: { ...toData(parsed.data), assignedToId, phones: { deleteMany: {}, create: phones } },
  });
  await logAudit("Mijoz tahrirlandi", {
    entity: "Client",
    entityId: id,
    detail: parsed.data.restaurantName,
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
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };
  if (!(await canMutateClient(g.session, id))) {
    return { ok: false, error: "Bu mijoz sizga biriktirilmagan" };
  }
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
  await logAudit("Mijoz ma'lumoti to'ldirildi", {
    entity: "Client",
    entityId: id,
    detail: Object.keys(patch).join(", "),
  });
  revalidatePath("/toldirilmagan");
  revalidatePath("/mijozlar");
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
      select: { name: true },
    });
    if (!op) return { ok: false, error: "Operator topilmadi yoki mos rol emas" };
    opName = op.name;
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

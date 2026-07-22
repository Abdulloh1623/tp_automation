"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { canMutateClient } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { CALL_RESULT, callResultLabel } from "@/lib/constants";
import { noteString, toFieldErrors } from "@/lib/validation";

const STAFF = ["ADMIN", "OPERATOR", "MANAGER"];

// Operator o'z izohini yozgandan keyin 5 soat ichida o'chirishi mumkin; keyin
// faqat tahrirlash qoladi. Admin har doim (vaqtdan qat'i nazar) o'chira/tahrirlay oladi.
const DELETE_WINDOW_MS = 5 * 60 * 60 * 1000;

function s(v: FormDataEntryValue | null): string | undefined {
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? undefined : str;
}

const callLogSchema = z.object({
  result: z.string().min(1, "Natijani tanlang"),
  note: noteString.optional(),
  nextFollowUpDate: z.string().optional(),
});

export type CallLogFormState = { error?: string; fieldErrors?: Record<string, string> };

export async function addCallLog(
  clientId: string,
  _prev: CallLogFormState,
  formData: FormData,
): Promise<CallLogFormState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { error: g.error };
  const session = g.session;
  if (!(await canMutateClient(session, clientId))) {
    return { error: "Mijoz topilmadi" };
  }

  const parsed = callLogSchema.safeParse({
    result: s(formData.get("result")),
    note: s(formData.get("note")),
    nextFollowUpDate: s(formData.get("nextFollowUpDate")),
  });

  if (!parsed.success) {
    return { error: "Maʼlumotlarni tekshiring", fieldErrors: toFieldErrors(parsed.error) };
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { error: "Mijoz topilmadi" };

  await db.callLog.create({
    data: {
      clientId,
      result: parsed.data.result,
      note: parsed.data.note ?? null,
      nextFollowUpDate: parsed.data.nextFollowUpDate
        ? new Date(parsed.data.nextFollowUpDate)
        : null,
      operatorId: session.userId,
    },
  });

  await logAudit("Qo'ng'iroq yozildi", {
    entity: "Client",
    entityId: clientId,
    detail: `${client.restaurantName}: ${callResultLabel(parsed.data.result)}`,
  });
  revalidatePath(`/mijozlar/${clientId}`);
  revalidatePath("/");
  return {};
}

export type CallLogActionState = { ok: boolean; error?: string };

const editSchema = z.object({
  result: z.string().min(1, "Natijani tanlang"),
  note: noteString.optional(),
  nextFollowUpDate: z.string().optional(),
});

/**
 * Izohni (qo'ng'iroq yozuvini) tahrirlash — matn, natija (holat) va keyingi
 * qo'ng'iroq sanasini o'zgartiradi. Kim va qachon tahrirlagani `editedBy/editedAt`
 * ga yoziladi (kartada ko'rinadi) va o'zgarish AuditLog'ga (eski → yangi) tushadi.
 *
 * Ruxsat: ADMIN har qanday izohni; boshqa xodim faqat O'ZI yozgan izohni
 * (vaqt cheklovisiz — tahrir har doim mumkin).
 */
export async function editCallLog(
  logId: string,
  formData: FormData,
): Promise<CallLogActionState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };
  const session = g.session;

  const log = await db.callLog.findUnique({
    where: { id: logId },
    include: { client: { select: { restaurantName: true } } },
  });
  if (!log) return { ok: false, error: "Izoh topilmadi" };

  const isAdmin = session.role === "ADMIN";
  const isOwner = !!log.operatorId && log.operatorId === session.userId;
  if (!isAdmin && !isOwner) return { ok: false, error: "Ruxsat yo'q" };

  const parsed = editSchema.safeParse({
    result: s(formData.get("result")),
    note: s(formData.get("note")),
    nextFollowUpDate: s(formData.get("nextFollowUpDate")),
  });
  if (!parsed.success) return { ok: false, error: "Ma'lumotlarni tekshiring" };

  // Natija — CALL_RESULT ro'yxatidan yoki o'zgartirilmagan joriy qiymat (tizim
  // yozuvlarida CALL_RESULT'da yo'q qiymat bo'lishi mumkin). `in` EMAS — prototip
  // kalitlari (constructor/toString) orqali axlat qiymat yozilishining oldini oladi.
  const newResult = parsed.data.result;
  if (!Object.hasOwn(CALL_RESULT, newResult) && newResult !== log.result) {
    return { ok: false, error: "Noto'g'ri natija" };
  }
  const newNote = parsed.data.note ?? null;

  await db.callLog.update({
    where: { id: logId },
    data: {
      result: newResult,
      note: newNote,
      nextFollowUpDate: parsed.data.nextFollowUpDate
        ? new Date(parsed.data.nextFollowUpDate)
        : null,
      editedAt: new Date(),
      editedById: session.userId,
    },
  });

  await logAudit("Izoh tahrirlandi", {
    entity: "Client",
    entityId: log.clientId,
    detail:
      `${log.client.restaurantName}: ` +
      `[${callResultLabel(log.result)}] "${log.note ?? ""}" → ` +
      `[${callResultLabel(newResult)}] "${newNote ?? ""}"`,
  });
  revalidatePath(`/mijozlar/${log.clientId}`);
  return { ok: true };
}

/**
 * Izohni o'chirish. Ruxsat: ADMIN har qanday izohni istalgan vaqtda; boshqa
 * xodim faqat O'ZI yozgan izohni va faqat yozilganidan keyin 5 soat ichida.
 * O'chirilgan izohning matni/natijasi AuditLog'da saqlanadi.
 */
export async function deleteCallLog(logId: string): Promise<CallLogActionState> {
  const g = await guardRole(STAFF);
  if (!g.ok) return { ok: false, error: g.error };
  const session = g.session;

  const log = await db.callLog.findUnique({
    where: { id: logId },
    include: { client: { select: { restaurantName: true } } },
  });
  if (!log) return { ok: false, error: "Izoh topilmadi" };

  const isAdmin = session.role === "ADMIN";
  const isOwner = !!log.operatorId && log.operatorId === session.userId;
  if (!isAdmin && !isOwner) return { ok: false, error: "Ruxsat yo'q" };
  // Egasi bo'lsa — faqat 5 soatlik oyna ichida (admin cheklovsiz).
  if (!isAdmin) {
    const age = Date.now() - log.calledAt.getTime();
    if (age > DELETE_WINDOW_MS) {
      return { ok: false, error: "O'chirish muddati o'tgan (5 soat) — faqat tahrirlash mumkin" };
    }
  }

  await db.callLog.delete({ where: { id: logId } });

  await logAudit("Izoh o'chirildi", {
    entity: "Client",
    entityId: log.clientId,
    detail: `${log.client.restaurantName}: [${callResultLabel(log.result)}] "${log.note ?? ""}"`,
  });
  revalidatePath(`/mijozlar/${log.clientId}`);
  return { ok: true };
}

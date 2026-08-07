"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { USTA_STATUS, ustaStatusLabel } from "@/lib/constants";
import { escalationStagePatch, isEscalationStage } from "@/lib/escalation";
import { safeNote } from "@/lib/validation";

export type AssignState = { ok: boolean; error?: string };

/**
 * Eskalatsiya qilingan lidni ustaga biriktirish. Boshliq/admin ISTALGANini,
 * mas'ul TP xodim (OPERATOR) esa faqat O'ZIGA biriktirilgan eskalatsiyani
 * ustaga biriktira oladi. Lid "Biriktirildi" (ESCALATED, mas'ul bor) dan
 * "Jarayonda" (FORWARDED) ga o'tadi. Izoh MAJBURIY.
 */
export async function assignUsta(
  clientId: string,
  ustaId: string,
  note: string,
): Promise<AssignState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  const usta = await db.user.findUnique({ where: { id: ustaId } });
  if (!usta || usta.role !== "INSTALLER") {
    return { ok: false, error: "Usta topilmadi" };
  }

  const current = await db.client.findUnique({
    where: { id: clientId },
    select: { stage: true, escalatedAt: true, assignedToId: true, escalationStaffId: true },
  });
  if (!current) return { ok: false, error: "Mijoz topilmadi" };

  // OPERATOR faqat o'ziga mas'ul biriktirilgan eskalatsiyaga usta biriktiradi.
  if (session.role === "OPERATOR" && current.escalationStaffId !== session.userId) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  await db.client.update({
    where: { id: clientId },
    data: {
      assignedUstaId: ustaId,
      stage: "FORWARDED", // ustada
      ustaStatus: "ASSIGNED",
      pendingStage: null,
      // FORWARDED — eskalatsiya bosqichi; escalatedAt saqlanadi (yoki qo'yiladi)
      ...escalationStagePatch("FORWARDED", current),
    },
  });

  // Biriktirish izohi — usta vazifa kontekstida ko'radi
  await db.callLog.create({
    data: {
      clientId,
      result: "ASSIGNED",
      note: noteText,
      operatorId: session.userId,
    },
  });

  await logAudit("Ustaga biriktirildi", {
    entity: "Client",
    entityId: clientId,
    detail: usta.name,
  });
  revalidatePath("/eskalatsiya");
  revalidatePath("/muammolar");
  return { ok: true };
}

export type UstaUpdateState = { ok: boolean; ustaStatus?: string; error?: string };

/** Usta vazifa holatini yangilash (Yo'ldaman/Bordim/Bajarildi/...). */
export async function updateUstaStatus(
  clientId: string,
  status: string,
  note?: string,
): Promise<UstaUpdateState> {
  const session = await requireSession();
  // `in` EMAS: "constructor"/"toString" kabi prototip kalitlari true qaytarib,
  // Client.ustaStatus va CallLog.result ga axlat qiymat yozilardi (DB enum yo'q).
  if (!Object.hasOwn(USTA_STATUS, status)) {
    return { ok: false, error: "Noto'g'ri holat" };
  }

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Vazifa topilmadi" };
  // Usta biriktirilgach jarayonni TP xodimi (OPERATOR) usta bilan bog'lanib yuritadi;
  // boshliq (ADMIN/MANAGER) ham yangilashi mumkin (ustalar tizimga kirmaydi)
  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  // "Bajarildi" — bo'lim yakuni (Jarayonda → Yakunlangan), izoh MAJBURIY.
  // Boshqa usta-statuslari (Yo'ldaman/Bordim/...) bo'lim ichidagi belgilar,
  // izohsiz ham qoldiriladi.
  const noteText = safeNote(note);
  if (status === "DONE" && !noteText) {
    return { ok: false, error: "Izoh majburiy" };
  }

  const data: {
    ustaStatus: string;
    stage?: string;
    nextContactDate?: Date | null;
    escalatedAt?: Date | null;
    escalationStaffId?: string | null;
    slaNotifiedAt?: Date | null;
  } = { ustaStatus: status };

  if (status === "DONE") {
    // Bajarildi — odatdagi siklga qaytadi; eskalatsiya belgilari tozalanadi
    data.stage = "RESOLVED";
    data.nextContactDate = client.nextPaymentDate ?? null;
    Object.assign(data, escalationStagePatch("RESOLVED", client));
  }

  await db.client.update({ where: { id: clientId }, data });
  await db.callLog.create({
    data: {
      clientId,
      result: status,
      note: noteText,
      operatorId: session.userId,
    },
  });

  await logAudit(`Usta holati: ${ustaStatusLabel(status)}`, {
    entity: "Client",
    entityId: clientId,
    detail: client.restaurantName,
  });
  revalidatePath("/eskalatsiya");
  revalidatePath("/muammolar");
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true, ustaStatus: status };
}

/**
 * Eskalatsiyani to'g'ridan-to'g'ri "Hal bo'ldi" deb yopish — mas'ul xodim
 * (yoki boshliq) usta javobini kutmasdan (masalan telefon orqali hal qilinsa)
 * navbatdan/ustadan chiqaradi. Yakunlangan bo'limida ko'rinishi uchun
 * `ustaStatus: DONE` va o'z nomidan `DONE` izohi yoziladi.
 *
 * `note` — MAJBURIY: qo'ng'iroq izohiga o'sha matn tushadi (qanday hal
 * qilingani mijoz tarixida qoladi).
 */
export async function resolveEscalation(
  clientId: string,
  note: string,
): Promise<AssignState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }
  const resolutionNote = safeNote(note);
  if (!resolutionNote) return { ok: false, error: "Izoh majburiy" };

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Mijoz topilmadi" };
  if (!isEscalationStage(client.stage)) {
    return { ok: false, error: "Bu mijoz eskalatsiya bosqichida emas" };
  }

  await db.client.update({
    where: { id: clientId },
    data: {
      stage: "RESOLVED",
      ustaStatus: "DONE",
      nextContactDate: client.nextPaymentDate ?? null,
      ...escalationStagePatch("RESOLVED", client),
    },
  });
  await db.callLog.create({
    data: {
      clientId,
      result: "DONE",
      note: resolutionNote,
      operatorId: session.userId,
    },
  });

  await logAudit("Eskalatsiya hal bo'ldi", {
    entity: "Client",
    entityId: clientId,
    detail: `${client.restaurantName} — ${resolutionNote}`,
  });
  revalidatePath("/eskalatsiya");
  revalidatePath("/muammolar");
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true };
}

// Eskalatsiyaga mas'ul qilib biriktirilishi mumkin bo'lgan TP xodimi rollari
const ESCALATION_STAFF_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];

/**
 * Eskalatsiyaga mas'ul TP xodimini biriktirish/olib tashlash — faqat boshliq/admin.
 * Mas'ul xodim usta + mijoz bilan bog'lanib jarayonni yakuniga yetkazadi.
 * `staffId: null` — mas'ulni olib tashlaydi (izoh talab qilinmaydi). Biriktirishda
 * izoh MAJBURIY.
 */
export async function assignEscalationStaff(
  clientId: string,
  staffId: string | null,
  note?: string,
): Promise<AssignState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  let noteText: string | null = null;
  if (staffId) {
    noteText = safeNote(note);
    if (!noteText) return { ok: false, error: "Izoh majburiy" };
    const staff = await db.user.findUnique({
      where: { id: staffId },
      select: { name: true, role: true, isActive: true },
    });
    if (!staff || !staff.isActive || !ESCALATION_STAFF_ROLES.includes(staff.role)) {
      return { ok: false, error: "Xodim topilmadi yoki faol emas" };
    }
  }

  let client;
  try {
    client = await db.client.update({
      where: { id: clientId },
      data: { escalationStaffId: staffId },
      select: { restaurantName: true },
    });
  } catch {
    return { ok: false, error: "Mijoz topilmadi" };
  }

  // Bo'lim ichidagi holat o'zgarishi ham tarixda (qo'ng'iroqlar jurnali) qolsin.
  await db.callLog.create({
    data: {
      clientId,
      result: staffId ? "ESCALATION_STAFF_ASSIGNED" : "UNASSIGNED",
      note: staffId ? noteText : "Eskalatsiya mas'uli olib tashlandi",
      operatorId: session.userId,
    },
  });

  await logAudit(staffId ? "Eskalatsiyaga mas'ul biriktirildi" : "Eskalatsiya mas'uli olindi", {
    entity: "Client",
    entityId: clientId,
  });
  // Biriktirilgan xodimga ilova-ichi bildirishnoma (o'ziga biriktirsa — yubormaydi)
  if (staffId && staffId !== session.userId) {
    await createNotification({
      title: "Sizga yangi eskalatsiya biriktirildi",
      body: client.restaurantName,
      userIds: [staffId],
    });
  }
  revalidatePath("/eskalatsiya");
  revalidatePath("/muammolar");
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true };
}

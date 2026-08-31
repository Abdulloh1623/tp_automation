"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import {
  USTA_STATUS,
  ustaStatusLabel,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/constants";
import { escalationStagePatch, isEscalationStage } from "@/lib/escalation";
import { safeNote } from "@/lib/validation";

export type AssignState = { ok: boolean; error?: string };

export type UstaProfileState = { ok: boolean; error?: string };

/**
 * Usta o'z ism-familiyasi, yashash manzili, qoplaydigan viloyatlari va
 * telefon raqamini o'zi yangilaydi — bir xil `User` yozuvi, /ustalar va
 * /malumotnoma'da ham darhol ko'rinadi (admin/menejer o'sha yerdan ham
 * tahrirlay oladi, ikkalasi ham yozadi).
 */
export async function updateMyProfile(input: {
  name: string;
  address?: string;
  regions?: string[];
  phone?: string;
}): Promise<UstaProfileState> {
  const session = await requireSession();
  if (session.role !== "INSTALLER") return { ok: false, error: "Ruxsat yo'q" };

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Ism kiriting" };

  const regs = (input.regions ?? []).map((r) => r.trim()).filter(Boolean);
  const address = (input.address ?? "").trim();
  const phone = (input.phone ?? "").trim();

  await db.user.update({
    where: { id: session.userId },
    data: {
      name,
      address: address || null,
      region: regs[0] ?? null,
      regions: regs.length ? regs.join(",") : null,
      phone: phone || null,
    },
  });
  await logAudit("Usta o'z ma'lumotlarini yangiladi", {
    entity: "User",
    entityId: session.userId,
  });
  // Bir xil User yozuvi — /ustalar, /malumotnoma va /vazifalarim'da ham darhol yangilanadi.
  revalidatePath("/vazifalarim");
  revalidatePath("/ustalar");
  revalidatePath("/malumotnoma");
  revalidatePath("/profil");
  return { ok: true };
}

/**
 * Usta o'z parolini o'zi almashtiradi (admin tasdig'i shart emas — /ustalar'da
 * admin/menejer allaqachon parolni to'g'ridan-to'g'ri o'zgartira oladi, oddiy
 * xodimning parol so'rovidan farqli o'laroq bu rol tor qamrovli). Kuchga
 * kirgach `sessionVersion` oshadi — joriy sessiya ham bekor bo'ladi, usta
 * yangi parol bilan qayta kirishi kerak bo'ladi.
 */
export async function changeMyPassword(input: {
  newPassword: string;
  confirm: string;
}): Promise<UstaProfileState> {
  const session = await requireSession();
  if (session.role !== "INSTALLER") return { ok: false, error: "Ruxsat yo'q" };

  const pw = (input.newPassword ?? "").trim();
  const cf = (input.confirm ?? "").trim();
  if (pw.length < MIN_PASSWORD_LENGTH || pw.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Parol ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} belgi bo'lsin`,
    };
  }
  if (pw !== cf) return { ok: false, error: "Parollar bir-biriga mos kelmadi" };

  await db.user.update({
    where: { id: session.userId },
    data: {
      passwordHash: await bcrypt.hash(pw, 10),
      sessionVersion: { increment: 1 },
    },
  });
  await logAudit("Usta parolini o'zi almashtirdi", {
    entity: "User",
    entityId: session.userId,
  });
  return { ok: true };
}

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
    select: {
      stage: true,
      escalatedAt: true,
      assignedToId: true,
      escalationStaffId: true,
    },
  });
  if (!current) return { ok: false, error: "Mijoz topilmadi" };

  // OPERATOR faqat o'ziga mas'ul biriktirilgan eskalatsiyaga usta biriktiradi.
  if (
    session.role === "OPERATOR" &&
    current.escalationStaffId !== session.userId
  ) {
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

export type UstaUpdateState = {
  ok: boolean;
  ustaStatus?: string;
  error?: string;
};

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
  // TP xodimi (OPERATOR/ADMIN/MANAGER) usta bilan bog'lanib yozadi, YOKI usta
  // endi o'zi (faqat o'ziga biriktirilgan vazifasini) yangilaydi.
  const canUpdate =
    ["ADMIN", "MANAGER", "OPERATOR"].includes(session.role) ||
    (session.role === "INSTALLER" && client.assignedUstaId === session.userId);
  if (!canUpdate) {
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
 * Eskalatsiya kanban'idagi "Hal bo'lmadi" ustuni — `ustaStatus`dan MUSTAQIL
 * bayroq (bosqichni — Yo'ldamanmi, Bordimmi — yo'qotmaslik uchun). Izoh
 * MAJBURIY: mijozga yeta olmagani yoki muammoni hal qila olmagani sababi
 * tarixda qolishi shart.
 */
export async function blockUstaTask(
  clientId: string,
  note: string,
): Promise<UstaUpdateState> {
  const session = await requireSession();
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Vazifa topilmadi" };
  const canUpdate =
    ["ADMIN", "MANAGER", "OPERATOR"].includes(session.role) ||
    (session.role === "INSTALLER" && client.assignedUstaId === session.userId);
  if (!canUpdate) return { ok: false, error: "Ruxsat yo'q" };

  const noteText = safeNote(note);
  if (!noteText) return { ok: false, error: "Izoh majburiy" };

  await db.client.update({
    where: { id: clientId },
    data: {
      ustaBlocked: true,
      ustaBlockedNote: noteText,
      ustaBlockedAt: new Date(),
    },
  });
  await db.callLog.create({
    data: {
      clientId,
      result: "USTA_BLOCKED",
      note: noteText,
      operatorId: session.userId,
    },
  });
  await logAudit("Eskalatsiya: Hal bo'lmadi", {
    entity: "Client",
    entityId: clientId,
    detail: client.restaurantName,
  });
  revalidatePath("/eskalatsiya");
  revalidatePath("/muammolar");
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true };
}

/** "Hal bo'lmadi"dan qaytarish — karta o'zining haqiqiy ustaStatus'iga qaytadi. Izoh shart emas. */
export async function unblockUstaTask(
  clientId: string,
): Promise<UstaUpdateState> {
  const session = await requireSession();
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Vazifa topilmadi" };
  const canUpdate =
    ["ADMIN", "MANAGER", "OPERATOR"].includes(session.role) ||
    (session.role === "INSTALLER" && client.assignedUstaId === session.userId);
  if (!canUpdate) return { ok: false, error: "Ruxsat yo'q" };

  await db.client.update({
    where: { id: clientId },
    data: { ustaBlocked: false, ustaBlockedNote: null, ustaBlockedAt: null },
  });
  await db.callLog.create({
    data: { clientId, result: "USTA_UNBLOCKED", operatorId: session.userId },
  });
  revalidatePath("/eskalatsiya");
  revalidatePath("/muammolar");
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true, ustaStatus: client.ustaStatus ?? undefined };
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
    if (
      !staff ||
      !staff.isActive ||
      !ESCALATION_STAFF_ROLES.includes(staff.role)
    ) {
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

  await logAudit(
    staffId
      ? "Eskalatsiyaga mas'ul biriktirildi"
      : "Eskalatsiya mas'uli olindi",
    {
      entity: "Client",
      entityId: clientId,
    },
  );
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

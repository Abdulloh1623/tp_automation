"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { USTA_STATUS, ustaStatusLabel } from "@/lib/constants";
import { escalationStagePatch } from "@/lib/escalation";

export type AssignState = { ok: boolean; error?: string };

/** Admin/boshliq: eskalatsiya qilingan lidni ustaga biriktiradi. */
export async function assignUsta(
  clientId: string,
  ustaId: string,
  note?: string,
): Promise<AssignState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  const usta = await db.user.findUnique({ where: { id: ustaId } });
  if (!usta || usta.role !== "INSTALLER") {
    return { ok: false, error: "Usta topilmadi" };
  }

  const current = await db.client.findUnique({
    where: { id: clientId },
    select: { stage: true, escalatedAt: true },
  });
  if (!current) return { ok: false, error: "Mijoz topilmadi" };

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
      note: note && note.trim() ? note.trim() : null,
      operatorId: session.userId,
    },
  });

  await logAudit("Ustaga biriktirildi", {
    entity: "Client",
    entityId: clientId,
    detail: usta.name,
  });
  revalidatePath("/eskalatsiya");
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
  if (!(status in USTA_STATUS)) return { ok: false, error: "Noto'g'ri holat" };

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Vazifa topilmadi" };
  // Usta biriktirilgach jarayonni TP xodimi (OPERATOR) usta bilan bog'lanib yuritadi;
  // boshliq (ADMIN/MANAGER) ham yangilashi mumkin (ustalar tizimga kirmaydi)
  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
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
      note: note && note.trim() ? note.trim() : null,
      operatorId: session.userId,
    },
  });

  await logAudit(`Usta holati: ${ustaStatusLabel(status)}`, {
    entity: "Client",
    entityId: clientId,
    detail: client.restaurantName,
  });
  revalidatePath("/eskalatsiya");
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true, ustaStatus: status };
}

// Eskalatsiyaga mas'ul qilib biriktirilishi mumkin bo'lgan TP xodimi rollari
const ESCALATION_STAFF_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];

/**
 * Eskalatsiyaga mas'ul TP xodimini biriktirish/olib tashlash — faqat boshliq/admin.
 * Mas'ul xodim usta + mijoz bilan bog'lanib jarayonni yakuniga yetkazadi.
 * `staffId: null` — mas'ulni olib tashlaydi.
 */
export async function assignEscalationStaff(
  clientId: string,
  staffId: string | null,
): Promise<AssignState> {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  if (staffId) {
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
  revalidatePath(`/mijozlar/${clientId}`);
  return { ok: true };
}

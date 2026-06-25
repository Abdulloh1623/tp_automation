"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { USTA_STATUS, ustaStatusLabel } from "@/lib/constants";

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

  await db.client.update({
    where: { id: clientId },
    data: {
      assignedUstaId: ustaId,
      stage: "FORWARDED", // ustada
      ustaStatus: "ASSIGNED",
      pendingStage: null,
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

/** Usta: vazifa holatini yangilaydi (Yo'ldaman/Bordim/Bajarildi/...). */
export async function updateUstaStatus(
  clientId: string,
  status: string,
  note?: string,
): Promise<UstaUpdateState> {
  const session = await requireSession();
  if (!(status in USTA_STATUS)) return { ok: false, error: "Noto'g'ri holat" };

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Vazifa topilmadi" };
  // Boshliq (ADMIN/MANAGER) usta nomidan holatni yangilaydi (ustalar tizimga kirmaydi)
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return { ok: false, error: "Ruxsat yo'q" };
  }

  const data: {
    ustaStatus: string;
    stage?: string;
    nextContactDate?: Date | null;
  } = { ustaStatus: status };

  if (status === "DONE") {
    // Bajarildi — odatdagi siklga qaytadi
    data.stage = "RESOLVED";
    data.nextContactDate = client.nextPaymentDate ?? null;
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

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ACTIVE_STAGES } from "@/lib/constants";
import { distributeLeadsCore } from "@/lib/leads-distribution";

export type DistributeState = {
  ok?: boolean;
  assigned?: number;
  operators?: number;
  error?: string;
};

export type ReleaseState = { ok: boolean; released?: number; error?: string };

/**
 * Xodim ishga kelmaganda — uning bugungi (faol) lidlarini biriktirishdan bo'shatadi
 * (`assignedToId = null`). Lidlar "biriktirilmagan" holatga qaytadi; boshliq ularni
 * boshqa operatorga (`/mijozlar` ommaviy biriktirish) berishi yoki keyingi taqsimot
 * olishi mumkin. Faqat ADMIN/MANAGER.
 */
export async function releaseOperatorLeads(
  operatorId: string,
): Promise<ReleaseState> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { ok: false, error: g.error };
  if (!operatorId) return { ok: false, error: "Operator tanlanmadi" };

  const op = await db.user.findUnique({
    where: { id: operatorId },
    select: { name: true },
  });
  if (!op) return { ok: false, error: "Operator topilmadi" };

  const res = await db.client.updateMany({
    where: {
      assignedToId: operatorId,
      status: "ACTIVE",
      stage: { in: ACTIVE_STAGES as unknown as string[] },
    },
    data: { assignedToId: null },
  });

  await logAudit("Operator lidlari bo'shatildi (xodim kelmadi)", {
    entity: "User",
    entityId: operatorId,
    detail: `${op.name}: ${res.count} lid biriktirishdan olindi`,
  });

  revalidatePath("/lidlar");
  revalidatePath("/mijozlar");
  revalidatePath("/analitika");
  return { ok: true, released: res.count };
}

/** Kunlik random taqsimot (ADMIN/MANAGER qo'lda; cron ham yadroni to'g'ridan chaqiradi). */
export async function redistributeLeads(
  _prev?: DistributeState,
  _formData?: FormData,
): Promise<DistributeState> {
  const g = await guardRole(["ADMIN", "MANAGER"]);
  if (!g.ok) return { error: g.error };

  const res = await distributeLeadsCore();
  if (res.error) return { error: res.error };

  revalidatePath("/lidlar");
  revalidatePath("/mijozlar");
  return { ok: true, assigned: res.assigned, operators: res.operators };
}

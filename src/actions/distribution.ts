"use server";

import { revalidatePath } from "next/cache";
import { guardRole } from "@/lib/auth";
import { distributeLeadsCore } from "@/lib/leads-distribution";

export type DistributeState = {
  ok?: boolean;
  assigned?: number;
  operators?: number;
  error?: string;
};

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

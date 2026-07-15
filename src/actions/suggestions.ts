"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type SuggestionState = { ok: boolean; error?: string };

const MANAGERS = ["ADMIN", "MANAGER"];

/** Taklifni hal qilingan deb belgilaydi (admin/menejer). */
export async function resolveSuggestion(id: string): Promise<SuggestionState> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };

  const s = await db.suggestion.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!s) return { ok: false, error: "Taklif topilmadi" };
  if (s.status === "RESOLVED") return { ok: true };

  await db.suggestion.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedById: g.session.userId,
    },
  });
  await logAudit("Taklif hal qilindi", { entity: "Suggestion", entityId: id });
  revalidatePath("/takliflar");
  return { ok: true };
}

/** Hal qilingan taklifni qayta ochadi (admin/menejer). */
export async function reopenSuggestion(id: string): Promise<SuggestionState> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };

  await db.suggestion.update({
    where: { id },
    // notifiedAt tozalanadi — qayta ochilsa 1-oy bildirishnomasi qaytadan ishlaydi
    data: { status: "OPEN", resolvedAt: null, resolvedById: null, notifiedAt: null },
  });
  await logAudit("Taklif qayta ochildi", { entity: "Suggestion", entityId: id });
  revalidatePath("/takliflar");
  return { ok: true };
}

/** Taklifni o'chiradi (admin/menejer). */
export async function deleteSuggestion(id: string): Promise<SuggestionState> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };

  await db.suggestion.delete({ where: { id } });
  await logAudit("Taklif o'chirildi", { entity: "Suggestion", entityId: id });
  revalidatePath("/takliflar");
  return { ok: true };
}

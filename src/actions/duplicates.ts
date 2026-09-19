"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { pairKey } from "@/lib/duplicates";

export type DupDismissState = { ok: boolean; error?: string };

// "O'chirish" bilan bir xil doira — Suggestion/dublikat sahifasidagi
// boshqa yozuv-boshqaruv amallari kabi.
const MANAGERS = ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT"];

const DUP_PATHS = ["/muammoli-mijozlar", "/mijozlar/dublikatlar"];

/**
 * Ikkita yozuvni bir-biriga qarshi "dublikat emas" deb belgilaydi — keyingi
 * avtomatik aniqlashda (`findDuplicateGroups`) aynan shu juftlik qayta
 * ko'rsatilmaydi. Guruh 3+ a'zodan iborat bo'lsa, faqat shu ikkitasi
 * ajraladi — qolganlar boshqa signal orqali hali ham bog'liq bo'lishi
 * mumkin (src/lib/duplicates.ts izohiga qarang).
 */
export async function dismissDuplicatePair(
  clientAId: string,
  clientBId: string,
): Promise<DupDismissState> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };
  if (!clientAId || !clientBId || clientAId === clientBId) {
    return { ok: false, error: "Noto'g'ri juftlik" };
  }

  // Ustun tartibi barqaror bo'lsin (pairKey bilan bir xil mantiq) — @@unique
  // ikki yo'nalishni ham to'g'ri ushlab qolsin.
  const [a, b] = clientAId < clientBId ? [clientAId, clientBId] : [clientBId, clientAId];

  const [clientA, clientB] = await Promise.all([
    db.client.findUnique({ where: { id: a }, select: { restaurantName: true, fullName: true } }),
    db.client.findUnique({ where: { id: b }, select: { restaurantName: true, fullName: true } }),
  ]);
  if (!clientA || !clientB) return { ok: false, error: "Mijoz topilmadi" };

  await db.duplicateDismissal.upsert({
    where: { clientAId_clientBId: { clientAId: a, clientBId: b } },
    create: { clientAId: a, clientBId: b, dismissedById: g.session.userId },
    update: {}, // allaqachon belgilangan — jim o'tkaziladi (tugma ikki marta bosilsa ham xato bermasin)
  });

  await logAudit("Dublikat emas deb belgilandi", {
    entity: "DuplicateDismissal",
    entityId: pairKey(a, b),
    detail: `${clientA.restaurantName || clientA.fullName} ↔ ${clientB.restaurantName || clientB.fullName}`,
  });
  for (const p of DUP_PATHS) revalidatePath(p);
  return { ok: true };
}

/** Oldin belgilangan "dublikat emas" juftlikni bekor qiladi — guruh qayta ko'rinishi mumkin. */
export async function undoDismissDuplicate(id: string): Promise<DupDismissState> {
  const g = await guardRole(MANAGERS);
  if (!g.ok) return { ok: false, error: g.error };

  const row = await db.duplicateDismissal.findUnique({
    where: { id },
    select: {
      clientA: { select: { restaurantName: true, fullName: true } },
      clientB: { select: { restaurantName: true, fullName: true } },
    },
  });
  if (!row) return { ok: false, error: "Topilmadi" };

  await db.duplicateDismissal.delete({ where: { id } });
  await logAudit("\"Dublikat emas\" belgisi bekor qilindi", {
    entity: "DuplicateDismissal",
    entityId: id,
    detail: row.clientA && row.clientB
      ? `${row.clientA.restaurantName || row.clientA.fullName} ↔ ${row.clientB.restaurantName || row.clientB.fullName}`
      : undefined,
  });
  for (const p of DUP_PATHS) revalidatePath(p);
  return { ok: true };
}

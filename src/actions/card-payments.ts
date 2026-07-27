"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { guardRole } from "@/lib/auth";
import { resolveCardPayment } from "@/lib/card-payment";
import { CARD_REJECT_REASON, type CardRejectReason } from "@/lib/constants";

export type CardActionState = { ok?: boolean; error?: string };

/**
 * Web'dan tasdiqlash/rad etish huquqi: ADMIN yoki karta tasdiqlovchisi
 * (`cardVerifier`). Telegram javob bermayotganda (telefon yo'q, bot ishlamayapti)
 * jarayon to'xtab qolmasligi uchun kerak.
 */
async function guardCardResolver() {
  const g = await guardRole(["ADMIN", "MANAGER", "OPERATOR"]);
  if (!g.ok) return { ok: false as const, error: g.error };
  const me = await db.user.findUnique({
    where: { id: g.session.userId },
    select: { cardVerifier: true },
  });
  if (g.session.role !== "ADMIN" && !me?.cardVerifier) {
    return { ok: false as const, error: "Bu amal uchun ruxsat yo'q" };
  }
  return { ok: true as const, session: g.session };
}

/** Karta to'lovini web orqali tasdiqlaydi — haqiqiy to'lov shu yerda yaraladi. */
export async function confirmCardPayment(requestId: string): Promise<CardActionState> {
  const g = await guardCardResolver();
  if (!g.ok) return { error: g.error };

  const res = await resolveCardPayment(requestId, {
    approve: true,
    actor: { userId: g.session.userId, name: g.session.name },
    via: "WEB",
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/tolovlar");
  revalidatePath("/");
  return { ok: true };
}

/** Karta to'lovini web orqali rad etadi (operator + adminlarga bildirishnoma). */
export async function rejectCardPayment(
  requestId: string,
  reason?: string,
): Promise<CardActionState> {
  const g = await guardCardResolver();
  if (!g.ok) return { error: g.error };

  const code =
    reason && reason in CARD_REJECT_REASON ? (reason as CardRejectReason) : "OTHER";
  const res = await resolveCardPayment(requestId, {
    approve: false,
    actor: { userId: g.session.userId, name: g.session.name },
    via: "WEB",
    reason: code,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/tolovlar");
  return { ok: true };
}

// Mijoz darajasidagi egalik nazorati (data-leak / IDOR oldini olish).
import { db } from "./db";
import type { SessionPayload } from "./session";

/**
 * Foydalanuvchi shu mijozni O'ZGARTIRA oladimi?
 * - ADMIN/MANAGER: har qanday mavjud mijoz.
 * - OPERATOR: faqat o'ziga biriktirilgan mijoz.
 * - boshqa (INSTALLER): yo'q.
 * Mijoz mavjud bo'lmasa ham false.
 */
export async function canMutateClient(
  session: SessionPayload,
  clientId: string,
): Promise<boolean> {
  if (!clientId) return false;
  if (session.role === "ADMIN" || session.role === "MANAGER") {
    const c = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
    return !!c;
  }
  if (session.role === "OPERATOR") {
    const c = await db.client.findFirst({
      where: { id: clientId, assignedToId: session.userId },
      select: { id: true },
    });
    return !!c;
  }
  return false;
}

const ASSIGNABLE_ROLES = ["OPERATOR", "ADMIN", "MANAGER"];

/**
 * Mijozga yoziladigan `assignedToId`ni xavfsiz aniqlaydi:
 * - OPERATOR: doimo o'zi (boshqa operatorga berib/o'g'irlab bo'lmaydi).
 * - ADMIN/MANAGER: berilgan id faqat mavjud, faol va mos rolli bo'lsa; aks holda null.
 */
export async function resolveAssignee(
  session: SessionPayload,
  raw: string | null | undefined,
): Promise<string | null> {
  if (session.role === "OPERATOR") return session.userId;
  if (!raw) return null;
  const u = await db.user.findFirst({
    where: { id: raw, role: { in: ASSIGNABLE_ROLES }, isActive: true },
    select: { id: true },
  });
  return u?.id ?? null;
}

import { db } from "./db";
import { getSession } from "./auth";

/**
 * Audit jurnaliga yozuv qo'shadi. Hech qachon asosiy amalni buzmaydi.
 *
 * `actor` berilsa sessiya o'qilmaydi — bu worker/bot kontekstida SHART, chunki
 * u yerda so'rov (cookie) yo'q va aks holda yozuv muallifsiz qolardi.
 */
export async function logAudit(
  action: string,
  opts?: {
    entity?: string;
    entityId?: string;
    detail?: string;
    actor?: { userId?: string | null; name?: string | null };
  },
): Promise<void> {
  try {
    const session = opts?.actor ? null : await getSession();
    await db.auditLog.create({
      data: {
        userId: opts?.actor ? (opts.actor.userId ?? null) : (session?.userId ?? null),
        userName: opts?.actor ? (opts.actor.name ?? null) : (session?.name ?? null),
        action,
        entity: opts?.entity ?? null,
        entityId: opts?.entityId ?? null,
        detail: opts?.detail ?? null,
      },
    });
  } catch {
    // audit yozuvidagi xato asosiy oqimni to'xtatmaydi
  }
}

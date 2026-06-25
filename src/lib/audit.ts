import { db } from "./db";
import { getSession } from "./auth";

/** Audit jurnaliga yozuv qo'shadi. Hech qachon asosiy amalni buzmaydi. */
export async function logAudit(
  action: string,
  opts?: { entity?: string; entityId?: string; detail?: string },
): Promise<void> {
  try {
    const session = await getSession();
    await db.auditLog.create({
      data: {
        userId: session?.userId ?? null,
        userName: session?.name ?? null,
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

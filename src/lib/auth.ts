// Server komponentlar uchun auth yordamchilari (cookies bilan).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { roleHome } from "./rbac";
import {
  decodeSession,
  encodeSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  type SessionPayload,
} from "./session";

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await encodeSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return decodeSession(token);
}

/**
 * Sessiyani talab qiladi; bo'lmasa /login ga yo'naltiradi.
 * Foydalanuvchi DB'da yo'q yoki faolsiz bo'lsa — sessiya bekor qilinadi
 * (deaktivatsiya darhol kuchga kiradi).
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  const u = await db.user.findUnique({
    where: { id: session.userId },
    select: { isActive: true },
  });
  // Foydalanuvchi o'chirilgan/faolsiz — cookie'ni route handler tozalaydi
  // (RSC render'da cookie o'zgartirib bo'lmaydi; middleware tsiklini ham oldini oladi).
  if (!u || !u.isActive) redirect("/api/logout");
  return session;
}

/** Sahifalar uchun: rolni talab qiladi; mos kelmasa o'z asosiy sahifasiga. */
export async function requireRole(roles: string[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect(roleHome(session.role));
  return session;
}

/**
 * Server action'lar uchun: sessiya + faollik + rolni tekshiradi (DB'dan yangi rol).
 * Redirect qilmaydi — natija obyekti qaytaradi.
 */
export async function guardRole(
  roles: string[],
): Promise<
  { ok: true; session: SessionPayload } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Tizimga kiring" };
  const u = await db.user.findUnique({
    where: { id: session.userId },
    select: { isActive: true, role: true },
  });
  if (!u || !u.isActive) return { ok: false, error: "Hisob faol emas" };
  if (!roles.includes(u.role)) return { ok: false, error: "Ruxsat yo'q" };
  return { ok: true, session };
}

/** Joriy foydalanuvchining to'liq yozuvi (DB dan). */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findUnique({ where: { id: session.userId } });
}

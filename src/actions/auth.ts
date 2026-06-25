"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { roleHome } from "@/lib/rbac";

const loginSchema = z.object({
  username: z.string().min(1, "Login kiriting"),
  password: z.string().min(1, "Parol kiriting"),
});

export type LoginState = { error?: string };

// Brute-force himoyasi — oddiy in-memory rate-limit (login+IP bo'yicha).
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; first: number }>();

function rateKey(username: string, ip: string): string {
  return `${ip}|${username.trim().toLowerCase()}`;
}

/** Bloklangan bo'lsa qolgan daqiqalarni qaytaradi, aks holda null. */
function blockedMinutes(key: string): number | null {
  const rec = attempts.get(key);
  if (!rec) return null;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return Math.ceil((rec.first + WINDOW_MS - Date.now()) / 60000);
  }
  return null;
}

function recordFail(key: string) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Login va parolni kiriting" };
  }

  const { username, password } = parsed.data;
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  const key = rateKey(username, ip);

  const left = blockedMinutes(key);
  if (left !== null) {
    return { error: `Juda ko'p urinish. ${left} daqiqadan so'ng qayta urinib ko'ring.` };
  }

  const user = await db.user.findUnique({
    where: { username: username.trim().toLowerCase() },
  });

  // Faolsiz hisob ham, noto'g'ri parol ham bir xil umumiy xato (enumeration oldini olish)
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    recordFail(key);
    return { error: "Login yoki parol noto'g'ri" };
  }

  // Ustalar (INSTALLER) tizimga kirmaydi — ular faqat boshliq tomonidan boshqariladi
  if (user.role === "INSTALLER") {
    return { error: "Ustalar tizimga kira olmaydi — boshliqqa murojaat qiling" };
  }

  attempts.delete(key); // muvaffaqiyatda nollash
  await createSession({
    userId: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  });

  // Audit: getSession hali yangi cookie'ni o'qiy olmaydi — to'g'ridan-to'g'ri yozamiz
  try {
    await db.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: "Tizimga kirdi",
        entity: "User",
        entityId: user.id,
        detail: `IP: ${ip}`,
      },
    });
  } catch {
    /* audit asosiy oqimni buzmaydi */
  }

  redirect(roleHome(user.role));
}

export async function logout(): Promise<void> {
  await logAudit("Tizimdan chiqdi", { entity: "User" });
  await destroySession();
  redirect("/login");
}

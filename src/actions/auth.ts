"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { roleHome } from "@/lib/rbac";
import { clientIp } from "@/lib/client-ip";

const loginSchema = z.object({
  username: z.string().min(1, "Login kiriting"),
  password: z.string().min(1, "Parol kiriting"),
});

export type LoginState = { error?: string };

// Brute-force himoyasi — in-memory rate-limit.
//
// IKKI kalit bo'yicha sanaladi:
//   1) IP + login  — bitta manbadan kelayotgan urinishlar;
//   2) faqat login — IP almashtirilsa ham hisob himoyalanib qolsin.
// (2) MUHIM: X-Forwarded-For qisman mijoz nazoratida, shu bois yolg'iz IP'ga
// tayanish mumkin emas — hujumchi har so'rovda sarlavhani o'zgartirib chegarani
// aylanib o'tardi.
const MAX_ATTEMPTS = 5;
const MAX_ATTEMPTS_PER_USER = 20; // IP'dan qat'i nazar, bitta hisob uchun
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000; // xotira o'sishiga qarshi qattiq chegara
const attempts = new Map<string, { count: number; first: number }>();

/** Eskirgan yozuvlarni tozalaydi; hajm chegaradan oshsa eng eskisini chiqaradi. */
function sweep() {
  const now = Date.now();
  for (const [k, v] of attempts) {
    if (now - v.first > WINDOW_MS) attempts.delete(k);
  }
  while (attempts.size > MAX_TRACKED_KEYS) {
    const oldest = attempts.keys().next();
    if (oldest.done) break;
    attempts.delete(oldest.value);
  }
}

/** Bloklangan bo'lsa qolgan daqiqalarni qaytaradi, aks holda null. */
function blockedMinutes(key: string, max: number): number | null {
  const rec = attempts.get(key);
  if (!rec) return null;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  if (rec.count >= max) {
    return Math.max(1, Math.ceil((rec.first + WINDOW_MS - Date.now()) / 60000));
  }
  return null;
}

function recordFail(key: string) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    if (attempts.size >= MAX_TRACKED_KEYS) sweep();
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

// Foydalanuvchi topilmaganda ham bcrypt ishlashi uchun soxta hash — javob vaqti
// mavjud/mavjud emas holatlarda bir xil bo'lsin (timing orqali login aniqlash).
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

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
  const uname = username.trim().toLowerCase();
  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"));
  const ipKey = `${ip}|${uname}`;
  const userKey = `user|${uname}`;

  const left = blockedMinutes(ipKey, MAX_ATTEMPTS) ?? blockedMinutes(userKey, MAX_ATTEMPTS_PER_USER);
  if (left !== null) {
    return { error: `Juda ko'p urinish. ${left} daqiqadan so'ng qayta urinib ko'ring.` };
  }

  const user = await db.user.findUnique({ where: { username: uname } });

  // Foydalanuvchi bo'lmasa ham bcrypt.compare chaqiriladi — javob vaqti bir xil
  // qolsin (aks holda "tez javob = bunday login yo'q" degan oshkora signal).
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // Faolsiz hisob ham, noto'g'ri parol ham bir xil umumiy xato (enumeration oldini olish)
  if (!user || !user.isActive || !passwordOk) {
    recordFail(ipKey);
    recordFail(userKey);
    return { error: "Login yoki parol noto'g'ri" };
  }

  attempts.delete(ipKey); // muvaffaqiyatda nollash
  attempts.delete(userKey);

  // Bitta account = bitta faol qurilma: har kirishda sessionVersion oshiriladi.
  // Eski qurilmaning JWT'sidagi versiya endi mos kelmay, keyingi so'rovda chiqariladi.
  const { sessionVersion } = await db.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  await createSession({
    userId: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    version: sessionVersion,
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

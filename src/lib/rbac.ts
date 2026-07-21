// Rol asosidagi kirish nazorati (RBAC) — middleware, sahifa va navigatsiya uchun.
// Toza funksiyalar (next/headers ishlatmaydi) — ham server, ham klient ishlatadi.

export type Role = "ADMIN" | "MANAGER" | "OPERATOR" | "INSTALLER";

/** Foydalanuvchi roli uchun asosiy sahifa (login-redirect, ruxsatsiz holatda). */
export function roleHome(role: string): string {
  if (role === "INSTALLER") return "/login"; // ustalar tizimga kirmaydi
  if (role === "OPERATOR") return "/lidlar";
  if (role === "MANAGER") return "/ombor";
  return "/"; // ADMIN
}

/** Har bir route prefiksiga ruxsat etilgan rollar. */
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/lidlar", roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { prefix: "/mijozlar", roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { prefix: "/toldirilmagan", roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { prefix: "/tolovlar", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
  { prefix: "/muammolar", roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { prefix: "/eskalatsiya", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
  { prefix: "/qaytarish", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
  { prefix: "/soliq", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
  { prefix: "/otkaz", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
  { prefix: "/takliflar", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/ombor", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/ustalar", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/uskuna-analitika", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/analitika", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/hisobot", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/moliya", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/foydalanuvchilar", roles: ["ADMIN"] },
  { prefix: "/audit", roles: ["ADMIN"] },
  { prefix: "/import", roles: ["ADMIN"] },
  { prefix: "/profil", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
  { prefix: "/bildirishnomalar", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
  // Jonli tablo — barcha xodimlar (ustalar login qilmaydi). Sessiya baribir
  // talab qilinadi (tablo/page.tsx da requireSession).
  { prefix: "/tablo", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
];

/** Foydalanuvchi shu sahifaga kira oladimi. */
export function canAccess(role: string, pathname: string): boolean {
  // Bosh sahifa (boshqaruv paneli) faqat ADMIN
  if (pathname === "/") return role === "ADMIN";
  // API yo'llari o'z handler'ida rolni alohida tekshiradi (requireApiSession) —
  // bu yerda ularni bloklamaymiz, aks holda 401/403 o'rniga redirect ketardi.
  if (pathname.startsWith("/api/")) return true;

  const rule = ROUTE_ROLES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  // QAT'IY YOPIQ: qoidasi yo'q sahifa RUXSAT ETILMAYDI. Ilgari bu yerda
  // `return true` turardi — ya'ni jadvalga qo'shishni unutilgan har qanday
  // yangi sahifa hamma rolga ochilib ketardi (fail-open). Endi yangi bo'lim
  // qo'shganda ROUTE_ROLES ga yozish MAJBURIY, aks holda u ochilmaydi.
  if (!rule) return false;
  return rule.roles.includes(role as Role);
}

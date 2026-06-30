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
  { prefix: "/tolovlar", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/muammolar", roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { prefix: "/eskalatsiya", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/qaytarish", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/ombor", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/ustalar", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/analitika", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/hisobot", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/foydalanuvchilar", roles: ["ADMIN"] },
  { prefix: "/audit", roles: ["ADMIN"] },
  { prefix: "/import", roles: ["ADMIN"] },
  { prefix: "/profil", roles: ["ADMIN", "MANAGER", "OPERATOR"] },
];

/** Foydalanuvchi shu sahifaga kira oladimi. */
export function canAccess(role: string, pathname: string): boolean {
  // Bosh sahifa (boshqaruv paneli) faqat ADMIN
  if (pathname === "/") return role === "ADMIN";
  const rule = ROUTE_ROLES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  if (!rule) return true; // qoidasiz yo'llar ochiq (umumiy)
  return rule.roles.includes(role as Role);
}

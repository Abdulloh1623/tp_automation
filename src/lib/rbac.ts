// Rol asosidagi kirish nazorati (RBAC) — middleware, sahifa va navigatsiya uchun.
// Toza funksiyalar (next/headers ishlatmaydi) — ham server, ham klient ishlatadi.

// VIEWER — ADMIN bilan bir xil ko'rish huquqiga ega, lekin HECH QANDAY
// yozuv/o'zgartirish amalini bajara olmaydi. Bu shunchaki ROUTE_ROLES/nav
// ro'yxatlariga qo'shilgan — server action'lardagi `guardRole`/`requireAdmin`
// ruxsat ro'yxatlariga ATAYIN qo'shilmagan, shu bilan yozuv avtomatik
// bloklanadi (fail-closed — ro'yxatda yo'q rol hech narsa qila olmaydi).
export type Role = "ADMIN" | "MANAGER" | "OPERATOR" | "INSTALLER" | "VIEWER";

/** Foydalanuvchi roli uchun asosiy sahifa (login-redirect, ruxsatsiz holatda). */
export function roleHome(role: string): string {
  if (role === "INSTALLER") return "/vazifalarim";
  if (role === "OPERATOR") return "/lidlar";
  if (role === "MANAGER") return "/ombor";
  return "/"; // ADMIN, VIEWER
}

/** Har bir route prefiksiga ruxsat etilgan rollar. */
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/lidlar", roles: ["ADMIN", "OPERATOR", "MANAGER", "VIEWER"] },
  // INSTALLER — mijoz ro'yxati + profili faqat O'QISH uchun (ma'lumot, qo'ng'iroq
  // tarixi, uskunalar); yangi/tahrir sahifalari uchun component ichida
  // requireRole bilan qo'shimcha to'sib qo'yilgan (bu prefiks ularni ham qamraydi).
  { prefix: "/mijozlar", roles: ["ADMIN", "OPERATOR", "MANAGER", "VIEWER", "INSTALLER"] },
  { prefix: "/muammoli-mijozlar", roles: ["ADMIN", "OPERATOR", "MANAGER", "VIEWER"] },
  // Eski manzil — /muammoli-mijozlar ga yo'naltiradi (ruxsat bir xil bo'lsin).
  { prefix: "/toldirilmagan", roles: ["ADMIN", "OPERATOR", "MANAGER", "VIEWER"] },
  { prefix: "/tolovlar", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  { prefix: "/muammolar", roles: ["ADMIN", "OPERATOR", "MANAGER", "VIEWER"] },
  { prefix: "/eskalatsiya", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  { prefix: "/qaytarish", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  // Ustalar aloqasi + uskuna narxlari — o'qish uchun ma'lumotnoma (tahrir /ustalar va /ombor'da).
  { prefix: "/malumotnoma", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  { prefix: "/soliq", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  { prefix: "/otkaz", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  { prefix: "/takliflar", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { prefix: "/ombor", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { prefix: "/ustalar", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { prefix: "/uskuna-analitika", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { prefix: "/analitika", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { prefix: "/hisobot", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { prefix: "/moliya", roles: ["ADMIN", "MANAGER", "VIEWER"] },
  { prefix: "/foydalanuvchilar", roles: ["ADMIN", "VIEWER"] },
  { prefix: "/audit", roles: ["ADMIN", "VIEWER"] },
  // Sof boshqaruv vositalari (ommaviy yuklash/tiklash, jadval tahrirlash,
  // qayta-aloqa qoidalari formasi) — ko'rish uchun mazmunli emas, VIEWER'ga
  // ATAYIN ochilmagan.
  { prefix: "/ish-jadvali", roles: ["ADMIN"] },
  { prefix: "/import", roles: ["ADMIN"] }, // eski manzil — /malumotlar ga yo'naltiradi
  { prefix: "/malumotlar", roles: ["ADMIN"] },
  { prefix: "/sozlamalar", roles: ["ADMIN"] },
  { prefix: "/profil", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER", "INSTALLER"] },
  { prefix: "/bildirishnomalar", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  // FAQ — barcha xodim o'qiydi va qo'sha oladi; tahrir/o'chirish faqat ADMIN
  // (action guardRole bilan). O'qish/qo'shish uchun uch rol ham ochiq.
  { prefix: "/faq", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  // Jonli tablo — xodimlar (ustalar bu yerga kirmaydi, ular /vazifalarim'da).
  { prefix: "/tablo", roles: ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] },
  // Usta (INSTALLER) — o'ziga biriktirilgan muammolar; /mijozlar (o'qish) va
  // /profil bundan tashqari ochiq, qolgan hamma joy yopiq.
  { prefix: "/vazifalarim", roles: ["INSTALLER"] },
];

/** Foydalanuvchi shu sahifaga kira oladimi. */
export function canAccess(role: string, pathname: string): boolean {
  // Bosh sahifa (boshqaruv paneli) — ADMIN va VIEWER
  if (pathname === "/") return role === "ADMIN" || role === "VIEWER";
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

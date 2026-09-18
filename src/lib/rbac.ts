// Rol asosidagi kirish nazorati (RBAC) — middleware, sahifa va navigatsiya uchun.
// Toza funksiyalar (next/headers ishlatmaydi) — ham server, ham klient ishlatadi.

// VIEWER — ADMIN bilan bir xil ko'rish huquqiga ega, lekin HECH QANDAY
// yozuv/o'zgartirish amalini bajara olmaydi. Bu shunchaki ROUTE_ROLES/nav
// ro'yxatlariga qo'shilgan — server action'lardagi `guardRole`/`requireAdmin`
// ruxsat ro'yxatlariga ATAYIN qo'shilmagan, shu bilan yozuv avtomatik
// bloklanadi (fail-closed — ro'yxatda yo'q rol hech narsa qila olmaydi).
//
// SUPER_ADMIN — cheklovsiz (eski MANAGER'ning o'rnini oladi, kengaytirilgan):
// ADMIN qila oladigan hammasi + boshqa ADMIN/SUPER_ADMIN hisoblarini
// boshqarish + `/malumotlar`dagi backup tiklash (server action darajasida,
// `src/actions/users.ts` va `src/actions/restore.ts`da tekshiriladi).
//
// HEAD_OF_SUPPORT ("Texnik bo'lim rahbari") — TP xodimlari (OPERATOR)ni
// to'liq boshqaradi va ularning barcha ishini (muammolar/eskalatsiya/
// qaytarish/kunlik lidlar) cheklovsiz ko'radi, ombor+ustalar+uskuna-
// analitikani yuritadi, ish jadvali/sozlamalar/ma'lumotlar (ommaviy yuklash)
// ustidan ishlaydi. Moliya/hisobot/audit/backup tiklashga kirmaydi.
export type Role =
  | "ADMIN"
  | "SUPER_ADMIN"
  | "HEAD_OF_SUPPORT"
  | "OPERATOR"
  | "INSTALLER"
  | "VIEWER";

/** Foydalanuvchi roli uchun asosiy sahifa (login-redirect, ruxsatsiz holatda). */
export function roleHome(role: string): string {
  if (role === "INSTALLER") return "/vazifalarim";
  if (role === "OPERATOR") return "/lidlar";
  return "/"; // ADMIN, SUPER_ADMIN, HEAD_OF_SUPPORT, VIEWER
}

/** Har bir route prefiksiga ruxsat etilgan rollar. */
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/lidlar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  // INSTALLER — mijoz ro'yxati + profili faqat O'QISH uchun (ma'lumot, qo'ng'iroq
  // tarixi, uskunalar); yangi/tahrir sahifalari uchun component ichida
  // requireRole bilan qo'shimcha to'sib qo'yilgan (bu prefiks ularni ham qamraydi).
  {
    prefix: "/mijozlar",
    roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER", "INSTALLER"],
  },
  {
    prefix: "/muammoli-mijozlar",
    roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"],
  },
  // Eski manzil — /muammoli-mijozlar ga yo'naltiradi (ruxsat bir xil bo'lsin).
  { prefix: "/toldirilmagan", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  { prefix: "/tolovlar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  { prefix: "/muammolar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  { prefix: "/eskalatsiya", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  { prefix: "/qaytarish", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  // Ustalar aloqasi + uskuna narxlari — o'qish uchun ma'lumotnoma (tahrir /ustalar va /ombor'da).
  { prefix: "/malumotnoma", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  { prefix: "/soliq", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  { prefix: "/otkaz", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  { prefix: "/takliflar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "VIEWER"] },
  { prefix: "/ombor", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "VIEWER"] },
  { prefix: "/ustalar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "VIEWER"] },
  { prefix: "/uskuna-analitika", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "VIEWER"] },
  { prefix: "/analitika", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "VIEWER"] },
  // Moliya/hisobot — ataylab HEAD_OF_SUPPORT'ga ochilmagan (moliyaviy ma'lumot).
  { prefix: "/hisobot", roles: ["ADMIN", "SUPER_ADMIN", "VIEWER"] },
  { prefix: "/moliya", roles: ["ADMIN", "SUPER_ADMIN", "VIEWER"] },
  // Foydalanuvchilar — HEAD_OF_SUPPORT kirsa ham, sahifa ichida faqat
  // OPERATOR qatorlarini ko'radi/tahrirlaydi (`foydalanuvchilar/page.tsx`).
  { prefix: "/foydalanuvchilar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "VIEWER"] },
  // Audit — ataylab HEAD_OF_SUPPORT'ga ochilmagan.
  { prefix: "/audit", roles: ["ADMIN", "SUPER_ADMIN", "VIEWER"] },
  { prefix: "/ish-jadvali", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT"] },
  { prefix: "/import", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT"] }, // eski manzil — /malumotlar ga yo'naltiradi
  // Ma'lumotlar — ommaviy yuklash ADMIN/SUPER_ADMIN/HEAD_OF_SUPPORT'ga ochiq;
  // backup tiklash (ichki tab) sahifa/action darajasida faqat SUPER_ADMIN'ga
  // cheklangan (`malumotlar/page.tsx`, `src/actions/restore.ts`, `backup.ts`).
  { prefix: "/malumotlar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT"] },
  { prefix: "/sozlamalar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT"] },
  {
    prefix: "/profil",
    roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER", "INSTALLER"],
  },
  { prefix: "/bildirishnomalar", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  // FAQ — barcha xodim o'qiydi va qo'sha oladi; tahrir/o'chirish faqat ADMIN
  // (action guardRole bilan). O'qish/qo'shish uchun barcha rollar ochiq.
  { prefix: "/faq", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  // Jonli tablo — xodimlar (ustalar bu yerga kirmaydi, ular /vazifalarim'da).
  { prefix: "/tablo", roles: ["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT", "OPERATOR", "VIEWER"] },
  // Usta (INSTALLER) — o'ziga biriktirilgan muammolar; /mijozlar (o'qish) va
  // /profil bundan tashqari ochiq, qolgan hamma joy yopiq.
  { prefix: "/vazifalarim", roles: ["INSTALLER"] },
];

/** Foydalanuvchi shu sahifaga kira oladimi. */
export function canAccess(role: string, pathname: string): boolean {
  // Bosh sahifa (boshqaruv paneli) — ADMIN/SUPER_ADMIN/HEAD_OF_SUPPORT/VIEWER
  if (pathname === "/") {
    return (
      role === "ADMIN" || role === "SUPER_ADMIN" || role === "HEAD_OF_SUPPORT" || role === "VIEWER"
    );
  }
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

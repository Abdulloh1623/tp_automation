// Muammo / eskalatsiya bo'limlarida "kimga ko'rinadi" qoidasi.
// Boshqaruv rollari (ADMIN/MANAGER) hamma narsani ko'radi va biriktiradi;
// TP xodim (OPERATOR) esa faqat o'ziga maxsus xodim qilib biriktirilganini ko'radi.
// Biriktirilmagan (staff = null) elementlar shu bilan avtomatik faqat boshliqqa qoladi.
// VIEWER (Kuzatuvchi) — ADMIN/MANAGER bilan bir xil TO'LIQ ko'rinishga ega, lekin
// hech narsa biriktira olmaydi; shuning uchun `isManagerRole` (tahrirlash huquqi)
// dan ATAYIN ajratilgan — `canViewAll` faqat ko'rinish qamrovini kengaytiradi.

/** ADMIN yoki MANAGER — boshqaruv (hamma narsani ko'radi VA biriktiradi/tahrirlaydi). */
export function isManagerRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * To'liq (cheklovsiz) ko'rinishga ega rollar — boshqaruv + Kuzatuvchi (VIEWER).
 * Faqat KO'RISH qamrovini kengaytiradi; tahrirlash huquqi uchun `isManagerRole`
 * ishlatilishda davom etadi (VIEWER'ni ATAYIN chiqarib tashlaydi).
 */
export function canViewAll(role: string): boolean {
  return isManagerRole(role) || role === "VIEWER";
}

/**
 * Biriktirilgan xodim bo'yicha ko'rinish qamrovi — Prisma `where` ichiga
 * yoyish (spread) uchun mo'ljallangan. To'liq ko'rish huquqi bor rol uchun
 * bo'sh (cheklovsiz); boshqa xodim uchun `{ [field]: userId }` — ya'ni faqat
 * o'ziga biriktirilgani.
 *
 * @param field  ticket uchun "assignedStaffId", eskalatsiya (Client) uchun
 *               "escalationStaffId".
 */
export function assignedStaffScope(
  role: string,
  userId: string,
  field: "assignedStaffId" | "escalationStaffId",
): { assignedStaffId?: string; escalationStaffId?: string } {
  return canViewAll(role) ? {} : { [field]: userId };
}

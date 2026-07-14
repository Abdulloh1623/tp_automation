// Muammo / eskalatsiya bo'limlarida "kimga ko'rinadi" qoidasi.
// Boshqaruv rollari (ADMIN/MANAGER) hamma narsani ko'radi va biriktiradi;
// TP xodim (OPERATOR) esa faqat o'ziga maxsus xodim qilib biriktirilganini ko'radi.
// Biriktirilmagan (staff = null) elementlar shu bilan avtomatik faqat boshliqqa qoladi.

/** ADMIN yoki MANAGER — boshqaruv (hamma narsani ko'radi/biriktiradi). */
export function isManagerRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Biriktirilgan xodim bo'yicha ko'rinish qamrovi — Prisma `where` ichiga
 * yoyish (spread) uchun mo'ljallangan. Boshqaruv roli uchun bo'sh (cheklovsiz);
 * boshqa xodim uchun `{ [field]: userId }` — ya'ni faqat o'ziga biriktirilgani.
 *
 * @param field  ticket uchun "assignedStaffId", eskalatsiya (Client) uchun
 *               "escalationStaffId".
 */
export function assignedStaffScope(
  role: string,
  userId: string,
  field: "assignedStaffId" | "escalationStaffId",
): { assignedStaffId?: string; escalationStaffId?: string } {
  return isManagerRole(role) ? {} : { [field]: userId };
}

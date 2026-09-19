import { db } from "./db";
import { findDuplicateGroups, type DupGroup } from "./duplicates";

export type DupPageClient = {
  id: string;
  fullName: string;
  restaurantName: string;
  region: string | null;
  phone: string;
  contractNumber: string | null;
  status: string;
  stage: string;
  monthlyAmount: number;
  currency: string;
  createdAt: Date;
  assignedTo: { name: string } | null;
  phones: { number: string }[];
};

/**
 * Bazadagi BARCHA mijozlarni (otkaz/o'chirilgan ham) yuklab, bo'lishi mumkin
 * bo'lgan dublikat guruhlarni qaytaradi. Otkaz qilinganlar ham kiritiladi —
 * ko'pincha bitta restoran bir marta faol, bir marta otkaz sifatida ikki
 * yozuvda uchraydi, aynan shuni ko'rsatish kerak.
 *
 * Oldin "dublikat emas" deb belgilangan juftliklar (DuplicateDismissal)
 * hisobga olinib, ular qayta guruhga tushmaydi (edge darajasida — boshqa
 * signal orqali hali bog'liq bo'lsa, guruh shu bog'lanish orqali qoladi).
 */
export async function loadDuplicateGroups(): Promise<DupGroup<DupPageClient>[]> {
  const [clients, dismissed] = await Promise.all([
    db.client.findMany({
      select: {
        id: true,
        fullName: true,
        restaurantName: true,
        region: true,
        phone: true,
        contractNumber: true,
        status: true,
        stage: true,
        monthlyAmount: true,
        currency: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
        phones: { select: { number: true } },
      },
    }),
    db.duplicateDismissal.findMany({
      select: { clientAId: true, clientBId: true },
    }),
  ]);
  return findDuplicateGroups(clients, dismissed);
}

export type DismissedDuplicateRow = {
  id: string;
  createdAt: Date;
  dismissedByName: string | null;
  clientA: { id: string; restaurantName: string; fullName: string } | null;
  clientB: { id: string; restaurantName: string; fullName: string } | null;
};

/**
 * "Dublikat emas" deb belgilangan juftliklar ro'yxati — bekor qilish (undo)
 * uchun. Mijozlardan biri keyinchalik o'chirilgan bo'lsa, DB darajasida
 * kaskad orqali yozuvning o'zi o'chadi (shuning uchun clientA/clientB
 * amalda doim to'ldirilgan bo'ladi — null-chidamlilik faqat TS xavfsizligi
 * uchun).
 */
export async function loadDismissedDuplicates(): Promise<DismissedDuplicateRow[]> {
  const rows = await db.duplicateDismissal.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      dismissedById: true,
      clientA: { select: { id: true, restaurantName: true, fullName: true } },
      clientB: { select: { id: true, restaurantName: true, fullName: true } },
    },
  });
  const userIds = [...new Set(rows.map((r) => r.dismissedById).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    dismissedByName: r.dismissedById ? (nameById.get(r.dismissedById) ?? null) : null,
    clientA: r.clientA,
    clientB: r.clientB,
  }));
}

/** Faqat dublikat guruhlar sonini qaytaradi (mijozlar sahifasidagi badge). */
export async function countDuplicateGroups(): Promise<number> {
  const [clients, dismissed] = await Promise.all([
    db.client.findMany({
      select: {
        id: true,
        fullName: true,
        restaurantName: true,
        phone: true,
        contractNumber: true,
        createdAt: true,
        phones: { select: { number: true } },
      },
    }),
    db.duplicateDismissal.findMany({
      select: { clientAId: true, clientBId: true },
    }),
  ]);
  return findDuplicateGroups(clients, dismissed).length;
}

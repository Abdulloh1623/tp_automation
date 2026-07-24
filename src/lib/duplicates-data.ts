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
 */
export async function loadDuplicateGroups(): Promise<DupGroup<DupPageClient>[]> {
  const clients = await db.client.findMany({
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
  });
  return findDuplicateGroups(clients);
}

/** Faqat dublikat guruhlar sonini qaytaradi (mijozlar sahifasidagi badge). */
export async function countDuplicateGroups(): Promise<number> {
  const clients = await db.client.findMany({
    select: {
      id: true,
      fullName: true,
      restaurantName: true,
      phone: true,
      contractNumber: true,
      createdAt: true,
      phones: { select: { number: true } },
    },
  });
  return findDuplicateGroups(clients).length;
}

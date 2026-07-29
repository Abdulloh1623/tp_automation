// Mijoz qaysi ustaga "tegishli" — sof mantiq.
//
// Ikki manba bor va ustuvorligi shu tartibda:
//   1. Mijozga ANIQ biriktirilgan usta (`Client.assignedUstaId`) — eng ishonchli;
//   2. biriktirilmagan bo'lsa — mijoz viloyatini qoplaydigan usta (hudud bo'yicha).
//
// Ikkinchisi taxmin, shuning uchun natijada `byRegion` bayrog'i qaytadi va UI
// buni ochiq ko'rsatadi — "biriktirilgan" bilan "hududiga to'g'ri keladi" ni
// aralashtirmaslik uchun.
//
// Viloyat nomlari importlardan har xil yozilgan bo'lishi mumkin
// ("Surxandaryo" / "Surxondaryo"), shuning uchun ikkala tomon ham
// `normalizeRegion` dan o'tkaziladi.
import { normalizeRegion, parseRegions } from "./constants";

export type UstaRef = {
  id: string;
  name: string;
  region: string | null;
  regions: string | null;
};

export type ClientUsta = {
  ustaId: string | null;
  ustaName: string | null;
  /** Usta hudud bo'yicha taxmin qilindi (aniq biriktirilmagan). */
  byRegion: boolean;
};

const NONE: ClientUsta = { ustaId: null, ustaName: null, byRegion: false };

/** Viloyatni qoplaydigan birinchi usta (ro'yxat tartibida). */
export function findUstaForRegion(ustalar: UstaRef[], region: string | null): UstaRef | null {
  const target = normalizeRegion(region);
  if (!target) return null;
  return (
    ustalar.find((u) =>
      parseRegions(u.regions, u.region).some((r) => normalizeRegion(r) === target),
    ) ?? null
  );
}

/**
 * Mijozning ustasi: avval biriktirilgani, bo'lmasa hudud bo'yicha taxmin.
 * Hech biri topilmasa — bo'sh natija (`ustaId: null`).
 */
export function resolveClientUsta(
  client: { region: string | null; assignedUstaId: string | null; assignedUstaName?: string | null },
  ustalar: UstaRef[],
): ClientUsta {
  if (client.assignedUstaId) {
    const assigned = ustalar.find((u) => u.id === client.assignedUstaId);
    const name = assigned?.name ?? client.assignedUstaName ?? null;
    // Nomi topilmasa ham id saqlanadi — filtr baribir ishlashi kerak.
    return { ustaId: client.assignedUstaId, ustaName: name, byRegion: false };
  }
  const byRegion = findUstaForRegion(ustalar, client.region);
  if (!byRegion) return NONE;
  return { ustaId: byRegion.id, ustaName: byRegion.name, byRegion: true };
}

// Mijozning haqiqiy IP'sini X-Forwarded-For dan ajratib olish.
//
// XAVFSIZLIK: X-Forwarded-For ni mijozning O'ZI ham yuborishi mumkin. Caddy
// (bizning reverse proxy) mavjud sarlavhaga o'zi ko'rgan IP'ni QO'SHADI, ya'ni:
//
//   mijoz yubordi:  X-Forwarded-For: 1.2.3.4        (soxta bo'lishi mumkin)
//   Caddy'dan keyin: X-Forwarded-For: 1.2.3.4, <haqiqiy IP>
//
// Demak ishonchli qiymat — O'NGDAN boshlab ishonchli proksilar soniga teng
// pozitsiyadagi element. Chapdagi (birinchi) elementni olish — klassik xato:
// hujumchi har so'rovda uni o'zgartirib, IP bo'yicha rate-limit'ni cheksiz
// aylanib o'tadi.

/** Oldimizdagi ishonchli proksilar soni (Caddy = 1). */
export function trustedHops(env: string | undefined = process.env.TRUSTED_PROXY_HOPS): number {
  const n = parseInt(env ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * X-Forwarded-For dan ishonchli mijoz IP'sini qaytaradi.
 * Sarlavha bo'lmasa yoki bo'sh bo'lsa — "local".
 */
export function clientIp(xff: string | null | undefined, hops = trustedHops()): string {
  if (!xff) return "local";
  const parts = xff
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "local";
  // Ishonchli proksilar qo'shgan elementlarni o'ngdan sanaymiz; ro'yxat kalta
  // bo'lsa (masalan proksi o'tkazib yuborilgan) eng chapdagini olamiz.
  return parts[Math.max(0, parts.length - hops)];
}

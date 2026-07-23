// So'rov-ID (request correlation id): bitta HTTP so'rovga tegishli barcha log va
// xato yozuvlarini bir-biriga bog'laydi. Middleware har so'rovga `x-request-id`
// beradi (bo'lmasa yaratadi) va uni ILOVAGA (request sarlavhasi) hamda JAVOBGA
// yozadi. Server komponent / action shu ID'ni `getRequestId()` bilan o'qiydi.
//
// DIQQAT: bu modulning YUQORI DARAJASIDA `next/headers` import QILINMAYDI —
// shunda Edge (middleware) faqat konstantani xavfsiz import qila oladi. Header
// nomi o'qish esa funksiya ichida dinamik import bilan (faqat Node kontekstda).

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Joriy so'rovning `x-request-id` qiymati (server komponent / server action
 * kontekstida). Kontekst bo'lmasa (cron/worker) yoki topilmasa — null.
 */
export async function getRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get(REQUEST_ID_HEADER);
  } catch {
    return null;
  }
}

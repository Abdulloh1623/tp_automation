// `revalidatePath` faqat Next so'rov kontekstida (server action / route handler)
// ishlaydi. Ayni kod worker jarayonidan ham chaqiriladi (Telegram bot karta
// to'lovini tasdiqlaganda haqiqiy Payment o'sha yerda yaraladi) — u yerda
// so'rov konteksti YO'Q va revalidatePath xato otadi.
//
// Shu o'ram xatoni yutadi: web'dan chaqirilganda kesh yangilanadi, worker'dan
// chaqirilganda esa jimgina o'tkazib yuboriladi (keyingi so'rovda sahifa
// baribir yangi ma'lumot bilan render bo'ladi).
import { revalidatePath } from "next/cache";

export function safeRevalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    /* so'rov konteksti yo'q (worker/bot) — kesh yangilash o'tkazib yuboriladi */
  }
}

/**
 * To'lov o'zgarganda (yozildi / tahrirlandi / o'chirildi) shu to'lovdan
 * hisob-kitob qiladigan BARCHA sahifalar.
 *
 * Hisobotlar `Payment.paidAt`/`amount` bo'yicha jonli hisoblanadi — ya'ni
 * tahrir bazada darhol aks etadi, lekin sahifalar keshda qolib eski raqamni
 * ko'rsatishi mumkin edi (ilgari faqat `/mijozlar/<id>` va `/tolovlar`
 * yangilanardi). Shuning uchun ro'yxat bitta joyda saqlanadi va to'lovga
 * tegadigan har bir yo'l shuni chaqiradi.
 */
export function revalidatePaymentSurfaces(clientId?: string): void {
  if (clientId) safeRevalidate(`/mijozlar/${clientId}`);
  for (const path of PAYMENT_SURFACES) safeRevalidate(path);
}

/** To'lov raqamlari ko'rinadigan sahifalar (mijoz kartochkasidan tashqari). */
const PAYMENT_SURFACES = [
  "/", // dashboard — bugungi/oylik tushum
  "/mijozlar", // ro'yxatdagi to'lov holati
  "/tolovlar", // to'lovlar reyestri
  "/hisobot", // oylik hisobot
  "/moliya", // MRR / qarzdorlik yoshi
  "/analitika", // jonli analitika
  "/profil", // "Mening natijalarim"
] as const;

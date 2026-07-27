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

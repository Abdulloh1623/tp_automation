import { redirect } from "next/navigation";

/**
 * Eski manzil — bo'lim /malumotlar ga ko'chdi (ichida "Ommaviy yuklash" tabi).
 * Saqlangan havolalar va xatcho'plar buzilmasligi uchun yo'naltiramiz.
 */
export default function ImportRedirectPage() {
  redirect("/malumotlar?tab=yuklash");
}

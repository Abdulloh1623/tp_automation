import { redirect } from "next/navigation";

// Eski manzil — ro'yxat "Muammoli mijozlar" bo'limining bir tabiga ko'chdi.
// Havola saqlanadi: bildirishnoma, xatcho'p va boshqaruv panelidagi eski
// yo'naltirishlar buzilmasin.
export default function IncompleteRedirect() {
  redirect("/muammoli-mijozlar?bolim=malumot");
}

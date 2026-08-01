import { redirect } from "next/navigation";

// Eski manzil — dublikat ro'yxati "Muammoli mijozlar" bo'limiga ko'chdi.
export default function DuplicatesRedirect() {
  redirect("/muammoli-mijozlar?bolim=dublikat");
}

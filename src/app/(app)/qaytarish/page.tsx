import { redirect } from "next/navigation";

// Qaytarish endi /muammolar ichida sub-bo'lim — eski havolalar shu yerga o'tadi.
export default function QaytarishRedirect() {
  redirect("/muammolar?bolim=qaytarish");
}

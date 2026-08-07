import { redirect } from "next/navigation";

// Eskalatsiya endi /muammolar ichida sub-bo'lim — eski havolalar shu yerga o'tadi.
export default function EskalatsiyaRedirect() {
  redirect("/muammolar?bolim=eskalatsiya");
}

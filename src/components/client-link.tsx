import { ClientQuickView } from "@/components/client-quick-view";

/**
 * Mijoz nomi — barcha bo'limlarda (muammolar, eskalatsiya, otkaz, qaytarish,
 * takliflar, to'lovlar, soliq…) bir xil ko'rinish. Bosilganda orqa fon
 * xiralashib (blur), kichik "tez ko'rish" modali ochiladi (profil sahifasiga
 * o'tmasdan). Ctrl/Cmd/o'rta-tugma bilan bosilsa — profilga oddiy navigatsiya.
 */
export function ClientLink({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return <ClientQuickView id={id} name={name} className={className} />;
}

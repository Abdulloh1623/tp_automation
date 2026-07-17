import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Mijoz nomini profil sahifasiga (`/mijozlar/[id]`) havola qiladi — barcha
 * bo'limlarda (muammolar, eskalatsiya, otkaz, qaytarish, takliflar, to'lovlar…)
 * bir xil ko'rinish va bosiladigan havola bo'lishi uchun umumiy komponent.
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
  return (
    <Link
      href={`/mijozlar/${id}`}
      className={cn(
        "font-medium text-slate-900 hover:text-primary-600 hover:underline dark:text-slate-100 dark:hover:text-primary-400",
        className,
      )}
    >
      {name}
    </Link>
  );
}

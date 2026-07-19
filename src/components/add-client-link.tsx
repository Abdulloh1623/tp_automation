import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Yangi mijoz qo'shish" havolasi — qidiruvda mijoz topilmaganda ko'rsatiladi.
 *
 * `newTab`: chek navbati kabi joylarda sahifadan chiqib ketmaslik uchun yangi
 * tabda ochiladi — operator 190 ta chek orasidagi joyini yo'qotmasin.
 * Ro'yxat sahifalarida (mijozlar, to'lovlar) o'sha tabda ochilgani qulayroq.
 */
export function AddClientLink({
  newTab = false,
  label = "Yangi mijoz qo'shish",
  size = "sm",
}: {
  newTab?: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <Link
      href="/mijozlar/yangi"
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-block"
    >
      <Button size={size}>
        <UserPlus className="h-4 w-4" />
        {label}
      </Button>
    </Link>
  );
}

/**
 * Qidiruv natijasi bo'sh bo'lgandagi to'liq holat: izoh + qo'shish tugmasi.
 * Jadval/ro'yxat ichida ishlatiladi (EmptyState dan ixchamroq).
 */
export function ClientNotFound({
  query,
  newTab = false,
  hint,
}: {
  query?: string;
  newTab?: boolean;
  /**
   * Ish navbatlarida (eskalatsiya, otkaz) izohni aniqlashtirish uchun:
   * u yerda mijoz bazada BO'LISHI mumkin, lekin shu navbatda bo'lmasligi
   * mumkin. Aks holda operator "mijoz yo'q ekan" deb noto'g'ri xulosa qiladi.
   */
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-700">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {query ? (
          <>
            &laquo;{query}&raquo; bo&apos;yicha mijoz topilmadi
          </>
        ) : (
          "Bunday mijoz mavjud emas"
        )}
      </p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        {hint ?? "Boshqa kalit so'z bilan qidiring yoki yangi mijoz qo'shing."}
      </p>
      <div className="mt-3">
        <AddClientLink newTab={newTab} />
      </div>
    </div>
  );
}

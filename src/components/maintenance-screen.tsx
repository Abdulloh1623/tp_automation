import { Wrench } from "lucide-react";

/**
 * Texnik tanaffus ekrani — ADMIN'dan boshqa hamma shuni ko'radi.
 * Sahifa server komponentida render bo'ladi; avtomatik yangilanish uchun
 * meta refresh ishlatiladi (klient JS shart emas).
 */
export function MaintenanceScreen({
  reason,
  startedAt,
}: {
  reason?: string;
  startedAt?: Date | null;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      {/* Har 15 soniyada qayta yuklanadi — tanaffus tugagach o'zi ochiladi. */}
      <meta httpEquiv="refresh" content="15" />
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <Wrench className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Tizimda texnik ishlar
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {reason?.trim()
            ? reason
            : "Ma'lumotlar bazasi bilan ishlanmoqda. Iltimos, biroz kuting."}
        </p>
        {startedAt && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Boshlangan vaqt:{" "}
            {startedAt.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">
          Sahifa har 15 soniyada o'zi yangilanadi — ishlar tugagach avtomatik ochiladi.
        </p>
      </div>
    </div>
  );
}

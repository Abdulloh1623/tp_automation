import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Ro'yxat/jadval bo'sh bo'lganda ko'rsatiladigan yo'riqnomali holat. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  actionHref,
  actionLabel,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
      {Icon && <Icon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden />}
      <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{hint}</p>}
      {/* Oddiy `<a>` — Next `<Link>` EMAS: yagona ishlatilishi (/mijozlar/yangi)
          `/mijozlar/[id]` intercepting route (@modal) tomonidan soft
          navigatsiyada mijoz ID sifatida ilinib, 404 chiqarardi. */}
      {actionHref && actionLabel && (
        <a href={actionHref} className="mt-4 inline-block">
          <Button size="sm">{actionLabel}</Button>
        </a>
      )}
    </div>
  );
}

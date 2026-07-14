// Boshliq uchun qaytarish jarayoni bo'yicha umumiy hisobot kartalari.
import { Clock, Wrench, PackageCheck, XCircle, TrendingUp } from "lucide-react";

export type ReturnStatsData = {
  pending: number; // usta kutilmoqda
  inProgress: number; // ustada (TP xodimi kuzatmoqda)
  doneTotal: number;
  done30: number; // oxirgi 30 kunda yakunlangan
  rejectedTotal: number;
  avgDays: number | null; // o'rtacha yakunlash muddati (kun)
};

export function ReturnStats({ stats }: { stats: ReturnStatsData }) {
  const cards = [
    {
      label: "Usta kutilmoqda",
      value: stats.pending,
      icon: Clock,
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Jarayonda (ustada)",
      value: stats.inProgress,
      icon: Wrench,
      tone: "text-primary-600 dark:text-primary-400",
    },
    {
      label: "Yakunlangan (jami)",
      value: stats.doneTotal,
      icon: PackageCheck,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Oxirgi 30 kunda",
      value: stats.done30,
      icon: TrendingUp,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Rad etilgan",
      value: stats.rejectedTotal,
      icon: XCircle,
      tone: "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
        >
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <c.icon className={`h-3.5 w-3.5 ${c.tone}`} /> {c.label}
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {c.value}
          </div>
          {c.label === "Yakunlangan (jami)" && stats.avgDays !== null && (
            <div className="text-[11px] text-slate-400 dark:text-slate-500">
              o&apos;rtacha {stats.avgDays.toFixed(1)} kunda
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

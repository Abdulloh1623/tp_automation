import Link from "next/link";
import { Wrench, AlertTriangle, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type Bolim = "muammo" | "eskalatsiya" | "qaytarish";

type Tone = "red" | "amber" | "violet";

const SECTIONS: { key: Bolim; label: string; icon: typeof Wrench; tone: Tone }[] = [
  { key: "muammo", label: "Muammolar", icon: Wrench, tone: "red" },
  { key: "eskalatsiya", label: "Eskalatsiya", icon: AlertTriangle, tone: "amber" },
  { key: "qaytarish", label: "Qaytarish", icon: PackageCheck, tone: "violet" },
];

const ACTIVE_TONE: Record<Tone, string> = {
  red: "border-red-500 text-red-700 bg-red-50 dark:border-red-400 dark:text-red-300 dark:bg-red-950/40",
  amber:
    "border-amber-500 text-amber-700 bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:bg-amber-950/40",
  violet:
    "border-violet-500 text-violet-700 bg-violet-50 dark:border-violet-400 dark:text-violet-300 dark:bg-violet-950/40",
};

const BADGE_TONE: Record<Tone, string> = {
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

/**
 * Muammolar/Eskalatsiya/Qaytarish o'rtasidagi sub-bo'lim tanlagichi — oddiy
 * Link (client state yo'q), bosilganda server navigatsiyasi bilan almashadi.
 */
export function SectionTabs({
  active,
  counts,
}: {
  active: Bolim;
  counts: Record<Bolim, number>;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900/60"
    >
      {SECTIONS.map((s) => {
        const isActive = s.key === active;
        const href = s.key === "muammo" ? "/muammolar" : `/muammolar?bolim=${s.key}`;
        return (
          <Link
            key={s.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex flex-1 min-w-max items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? ACTIVE_TONE[s.tone]
                : "border-transparent text-slate-500 hover:bg-white hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center">
              <s.icon className="h-4 w-4" />
            </span>
            {s.label}
            <span
              className={cn(
                "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                BADGE_TONE[s.tone],
              )}
            >
              {counts[s.key]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

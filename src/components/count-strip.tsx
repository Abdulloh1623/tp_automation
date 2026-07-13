import { cn } from "@/lib/utils";

export type CountTone = "default" | "amber" | "red" | "emerald" | "sky" | "violet";

export type CountItem = {
  label: string;
  value: number;
  tone?: CountTone;
};

const TONES: Record<CountTone, string> = {
  default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  red: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
};

/** Holat bo'yicha sanoq chiplari qatori — sahifa tepasida umumiy ko'rinish. */
export function CountStrip({ items }: { items: CountItem[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
            TONES[it.tone ?? "default"],
          )}
        >
          <span className="tabular-nums font-semibold">{it.value}</span>
          <span className="opacity-80">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

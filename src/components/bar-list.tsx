import { cn } from "@/lib/utils";

type Color = "blue" | "emerald" | "amber" | "violet" | "red";

const colorMap: Record<Color, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  red: "bg-red-500",
};

export function BarList({
  items,
  color = "blue",
  format,
}: {
  items: { label: string; value: number }[];
  color?: Color;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">Ma'lumot yo'q</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((i) => {
        const pct = Math.round((i.value / max) * 100);
        return (
          <div key={i.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-700">{i.label}</span>
              <span className="font-medium text-slate-900">
                {format ? format(i.value) : i.value}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", colorMap[color])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

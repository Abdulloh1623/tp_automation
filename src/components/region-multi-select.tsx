"use client";

import { REGIONS } from "@/lib/constants";

/** Bir nechta viloyat tanlash (chip ko'rinishida). */
export function RegionMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(r: string) {
    onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {REGIONS.map((r) => {
        const on = value.includes(r);
        return (
          <button
            type="button"
            key={r}
            onClick={() => toggle(r)}
            className={
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
              (on
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50")
            }
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

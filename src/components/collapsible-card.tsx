"use client";

// Bo'lim (Section) kartasini yig'iladigan (akkordeon) qiladi: sarlavhaga bosilsa
// ichki tarkib yashiriladi/ochiladi. Ikonli sarlavha SERVER tomonda render
// qilinib, tayyor ReactNode sifatida `header` ga uzatiladi — shu bois lucide
// ikon komponenti klient chegarasidan O'TMAYDI (RSC ikon-prop tuzog'i).

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleCard({
  header,
  action,
  children,
  className,
  defaultOpen = true,
}: {
  header: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800/70 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex flex-1 items-center gap-2.5 text-left"
        >
          {header}
          <ChevronDown
            className={cn(
              "ml-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 dark:group-hover:text-slate-300",
              open ? "" : "-rotate-90",
            )}
          />
        </button>
        {action}
      </div>
      {open && <div className="p-4 sm:p-5">{children}</div>}
    </section>
  );
}

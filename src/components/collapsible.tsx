"use client";

// Yengil "Batafsil" ochib/yopib turadigan disclosure — sarlavhasiz, matn ichida.
// Tarkib (children) server tomonda render qilinadi; bu komponent faqat
// ko'rinishini boshqaradi (masalan Boshqaruv panelidagi daromad batafsil analitikasi).

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function Collapsible({
  closedLabel = "Batafsil",
  openLabel = "Yopish",
  children,
  defaultOpen = false,
}: {
  closedLabel?: string;
  openLabel?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-500/10 dark:text-primary-400"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        {open ? openLabel : closedLabel}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

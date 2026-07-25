"use client";

// Uzun ro'yxatlarni (qo'ng'iroq tarixi, faoliyat jurnali) qisqartirib ko'rsatadi:
// boshida faqat bir nechta yozuv, qolganini "Batafsil" tugmasi ochadi.
// Bolalar (children) server komponentida oldindan render qilinadi — bu komponent
// faqat qaysilari ko'rinishini boshqaradi.

import { Children, useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleList({
  children,
  previewCount = 3,
  className,
}: {
  children: React.ReactNode;
  previewCount?: number;
  className?: string;
}) {
  const items = Children.toArray(children);
  const [open, setOpen] = useState(false);

  const hidden = items.length - previewCount;
  const shown = open ? items : items.slice(0, previewCount);

  return (
    <div className={className}>
      {shown}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-500/10 dark:text-primary-400"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
          {open ? "Yig'ish" : `Batafsil — yana ${hidden} ta`}
        </button>
      )}
    </div>
  );
}

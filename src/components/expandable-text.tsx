"use client";

// Uzun matnni (qo'ng'iroq izohi / comment, faoliyat tafsiloti) qisqartirib
// ko'rsatadi. Belgilangan uzunlikdan oshsa "Batafsil" tugmasi bilan to'liq
// ochiladi. Qisqa matn bo'lsa — oddiy matn (tugmasiz).

import { useState } from "react";

export function ExpandableText({
  text,
  className,
  clampChars = 160,
}: {
  text: string;
  className?: string;
  clampChars?: number;
}) {
  const [open, setOpen] = useState(false);

  const isLong = text.length > clampChars;
  if (!isLong) {
    return <p className={`${className ?? ""} whitespace-pre-wrap`}>{text}</p>;
  }

  const preview = text.slice(0, clampChars).trimEnd();

  return (
    <p className={`${className ?? ""} whitespace-pre-wrap`}>
      {open ? text : `${preview}… `}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="align-baseline text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        {open ? "Yig'ish" : "Batafsil"}
      </button>
    </p>
  );
}

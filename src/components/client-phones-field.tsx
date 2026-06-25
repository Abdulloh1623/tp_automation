"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PhoneValue = { label: string; number: string };
type Row = { key: number; label: string; number: string };

let counter = 0;
const SUGGESTIONS = ["Egasi", "Menejer", "Kassir", "Buxgalter", "Ombor"];

/**
 * Mijozning qo'shimcha yorliqli telefonlari (dinamik qatorlar).
 * Inputlar `phoneLabel`/`phoneNumber` (takrorlanuvchi) — server FormData.getAll o'qiydi.
 */
export function ClientPhonesField({
  defaultPhones = [],
}: {
  defaultPhones?: PhoneValue[];
}) {
  const [rows, setRows] = useState<Row[]>(
    defaultPhones.map((p) => ({ key: counter++, label: p.label, number: p.number })),
  );

  return (
    <div className="space-y-2">
      <Label>Qo'shimcha telefonlar (egasi, menejer, kassir...)</Label>
      <datalist id="phone-labels">
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          <Input
            name="phoneLabel"
            list="phone-labels"
            defaultValue={r.label}
            placeholder="Yorliq (masalan Egasi)"
            className="w-44"
          />
          <Input
            name="phoneNumber"
            defaultValue={r.number}
            placeholder="+998 ..."
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            className="shrink-0 rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
            title="O'chirish"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, { key: counter++, label: "", number: "" }])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" /> Telefon qo'shish
      </button>
    </div>
  );
}

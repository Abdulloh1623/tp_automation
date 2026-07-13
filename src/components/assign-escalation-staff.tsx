"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, Check, X } from "lucide-react";
import { assignEscalationStaff } from "@/actions/usta";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";

export type StaffOption = { id: string; name: string };

/**
 * Eskalatsiyaga mas'ul TP xodimini biriktirish/o'zgartirish — boshliq/admin.
 * Mas'ul jarayonni usta+mijoz bilan yakuniga yetkazadi. Barcha xodimlar
 * mas'ul kimligini ko'radi (faqat boshliq o'zgartira oladi).
 */
export function AssignEscalationStaff({
  clientId,
  staffId,
  staffName,
  options,
  canAssign,
}: {
  clientId: string;
  staffId: string | null;
  staffName: string | null;
  options: StaffOption[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>(staffId ?? "");

  function run(id: string | null, okMsg: string) {
    start(async () => {
      const res = await assignEscalationStaff(clientId, id);
      if (res.ok) {
        toast(okMsg, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  // Mas'ul biriktirilgan — hamma ko'radi
  if (staffId && !canAssign) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-800 dark:text-sky-200">
        <UserCheck className="h-3.5 w-3.5" /> Mas'ul: {staffName}
      </span>
    );
  }

  if (!canAssign) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500">
        Mas'ul xodim biriktirilmagan (boshliq biriktiradi)
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        <UserCheck className="h-3.5 w-3.5 text-sky-500" /> Mas'ul xodim:
      </span>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
      >
        <option value="">— tanlang —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={pending || !pick || pick === staffId}
        onClick={() => run(pick, "Mas'ul biriktirildi")}
      >
        <Check className="h-3.5 w-3.5" /> {staffId ? "O'zgartirish" : "Biriktirish"}
      </Button>
      {staffId && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-red-600 dark:text-red-400"
          disabled={pending}
          onClick={() => {
            setPick("");
            run(null, "Mas'ul olib tashlandi");
          }}
        >
          <X className="h-3.5 w-3.5" /> Olib tashlash
        </Button>
      )}
    </div>
  );
}

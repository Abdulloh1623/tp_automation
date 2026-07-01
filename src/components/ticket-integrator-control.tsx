"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Check, X } from "lucide-react";
import { assignTicketUsta } from "@/actions/tickets";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type IntegratorOpt = { id: string; name: string; phone: string | null };

export function TicketIntegratorControl({
  ticketId,
  canAssign,
  assignedId,
  assignedName,
  assignedPhone,
  ustalar,
}: {
  ticketId: string;
  canAssign: boolean;
  assignedId: string | null;
  assignedName: string | null;
  assignedPhone: string | null;
  ustalar: IntegratorOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>(assignedId ?? "");

  function run(ustaId: string | null, okMsg: string) {
    start(async () => {
      const res = await assignTicketUsta(ticketId, ustaId);
      if (res.ok) {
        toast(okMsg, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  // Biriktirilgan holat — barcha xodimlar integrator nomi + telefonini ko'radi
  if (assignedId) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 px-3 py-2 text-sm">
        <Wrench className="h-4 w-4 shrink-0 text-violet-500" />
        <span className="font-medium text-slate-800 dark:text-slate-200">Integrator: {assignedName}</span>
        {assignedPhone && (
          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
            <a href={`tel:${normalizePhone(assignedPhone)}`} className="text-blue-600 dark:text-blue-400">
              {formatPhone(assignedPhone)}
            </a>
            <PhoneCopyButton phone={assignedPhone} />
          </span>
        )}
        {canAssign && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs text-red-600 dark:text-red-400"
            disabled={pending}
            onClick={() => run(null, "Integrator olib tashlandi")}
          >
            <X className="h-3.5 w-3.5" /> Olib tashlash
          </Button>
        )}
      </div>
    );
  }

  // Biriktirilmagan — faqat boshliq/admin biriktira oladi
  if (!canAssign) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Integrator biriktirilmagan (boshliq biriktiradi)
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
      >
        <option value="">Integrator (usta) tanlang…</option>
        {ustalar.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={pending || !pick}
        onClick={() => run(pick, "Integratorga biriktirildi")}
      >
        <Check className="h-3.5 w-3.5" /> Biriktirish
      </Button>
    </div>
  );
}

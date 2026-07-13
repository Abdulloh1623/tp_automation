"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Monitor, Check, X } from "lucide-react";
import { assignTicketStaff, assignTicketUsta } from "@/actions/tickets";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type IntegratorOpt = { id: string; name: string; phone: string | null };
type Assigned = { id: string; name: string; phone: string | null } | null;

/** Bitta biriktiruv slot'i — mas'ul xodim yoki usta. */
function AssignRow({
  kind,
  assigned,
  options,
  canAssign,
  action,
}: {
  kind: "XODIM" | "USTA";
  assigned: Assigned;
  options: IntegratorOpt[];
  canAssign: boolean;
  action: (id: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>("");

  const isXodim = kind === "XODIM";
  const label = isXodim ? "Mas'ul xodim" : "Usta (joyida)";
  const Icon = isXodim ? Monitor : Wrench;
  const tone = isXodim
    ? "bg-sky-50 dark:bg-sky-950/30"
    : "bg-violet-50 dark:bg-violet-950/30";
  const iconTone = isXodim ? "text-sky-500" : "text-violet-500";

  function run(id: string | null, okMsg: string) {
    start(async () => {
      const res = await action(id);
      if (res.ok) {
        toast(okMsg, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  if (assigned) {
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${tone}`}>
        <Icon className={`h-4 w-4 shrink-0 ${iconTone}`} />
        <span className="font-medium text-slate-800 dark:text-slate-200">
          {label}: {assigned.name}
        </span>
        {assigned.phone && (
          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
            <a href={`tel:${normalizePhone(assigned.phone)}`} className="text-blue-600 dark:text-blue-400">
              {formatPhone(assigned.phone)}
            </a>
            <PhoneCopyButton phone={assigned.phone} />
          </span>
        )}
        {canAssign && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs text-red-600 dark:text-red-400"
            disabled={pending}
            onClick={() => run(null, "Biriktiruv olib tashlandi")}
          >
            <X className="h-3.5 w-3.5" /> Olib tashlash
          </Button>
        )}
      </div>
    );
  }

  if (!canAssign) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {label} biriktirilmagan (boshliq biriktiradi)
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className={`h-3.5 w-3.5 ${iconTone}`} /> {label}:
      </span>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
      >
        <option value="">{isXodim ? "Xodim tanlang…" : "Usta tanlang…"}</option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={pending || !pick}
        onClick={() => run(pick, isXodim ? "Mas'ul xodim biriktirildi" : "Ustaga biriktirildi")}
      >
        <Check className="h-3.5 w-3.5" /> Biriktirish
      </Button>
    </div>
  );
}

/**
 * Muammoga mas'ul xodim VA usta biriktirish (ikkalasi birga bo'lishi mumkin).
 * Mas'ul xodim jarayonni nazorat qilib yakunlaydi; usta joyida hal etadi.
 */
export function TicketIntegratorControl({
  ticketId,
  canAssign,
  staff,
  usta,
  ustalar,
  xodimlar,
}: {
  ticketId: string;
  canAssign: boolean;
  staff: Assigned;
  usta: Assigned;
  ustalar: IntegratorOpt[];
  xodimlar: IntegratorOpt[];
}) {
  return (
    <div className="space-y-2">
      <AssignRow
        kind="XODIM"
        assigned={staff}
        options={xodimlar}
        canAssign={canAssign}
        action={(id) => assignTicketStaff(ticketId, id)}
      />
      <AssignRow
        kind="USTA"
        assigned={usta}
        options={ustalar}
        canAssign={canAssign}
        action={(id) => assignTicketUsta(ticketId, id)}
      />
    </div>
  );
}

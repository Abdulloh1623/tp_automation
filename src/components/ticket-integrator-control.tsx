"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Monitor, Check, X } from "lucide-react";
import { assignTicket, type TicketAssigneeType } from "@/actions/tickets";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type IntegratorOpt = { id: string; name: string; phone: string | null };

export function TicketIntegratorControl({
  ticketId,
  canAssign,
  assigneeType,
  assignedId,
  assignedName,
  assignedPhone,
  ustalar,
  xodimlar,
}: {
  ticketId: string;
  canAssign: boolean;
  assigneeType: TicketAssigneeType | null;
  assignedId: string | null;
  assignedName: string | null;
  assignedPhone: string | null;
  ustalar: IntegratorOpt[];
  xodimlar: IntegratorOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Tanlangan biriktirish usuli — sukut bo'yicha usta (joyida)
  const [mode, setMode] = useState<TicketAssigneeType>("USTA");
  const [pick, setPick] = useState<string>("");

  function run(type: TicketAssigneeType | null, id: string | null, okMsg: string) {
    start(async () => {
      const res = await assignTicket(ticketId, type, id);
      if (res.ok) {
        toast(okMsg, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  // Biriktirilgan holat — barcha xodimlar biriktiruvchi nomi + telefonini ko'radi
  if (assignedId) {
    const isXodim = assigneeType === "XODIM";
    return (
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          isXodim
            ? "bg-sky-50 dark:bg-sky-950/30"
            : "bg-violet-50 dark:bg-violet-950/30"
        }`}
      >
        {isXodim ? (
          <Monitor className="h-4 w-4 shrink-0 text-sky-500" />
        ) : (
          <Wrench className="h-4 w-4 shrink-0 text-violet-500" />
        )}
        <span className="font-medium text-slate-800 dark:text-slate-200">
          {isXodim ? "Xodim (online)" : "Integrator (usta)"}: {assignedName}
        </span>
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
            onClick={() => run(null, null, "Biriktiruv olib tashlandi")}
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
        Muammo biriktirilmagan (boshliq biriktiradi)
      </p>
    );
  }

  const options = mode === "USTA" ? ustalar : xodimlar;

  function switchMode(next: TicketAssigneeType) {
    setMode(next);
    setPick(""); // usul o'zgarganda tanlov tozalanadi (ro'yxatlar boshqacha)
  }

  return (
    <div className="space-y-2">
      {/* Biriktirish usuli — joyida (usta) yoki online (xodim) */}
      <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => switchMode("USTA")}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
            mode === "USTA"
              ? "bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <Wrench className="h-3.5 w-3.5" /> Ustaga (joyida)
        </button>
        <button
          type="button"
          onClick={() => switchMode("XODIM")}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
            mode === "XODIM"
              ? "bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <Monitor className="h-3.5 w-3.5" /> Xodimga (online)
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
        >
          <option value="">
            {mode === "USTA" ? "Integrator (usta) tanlang…" : "Xodim tanlang…"}
          </option>
          {options.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={pending || !pick}
          onClick={() =>
            run(
              mode,
              pick,
              mode === "USTA" ? "Ustaga biriktirildi" : "Xodimga biriktirildi",
            )
          }
        >
          <Check className="h-3.5 w-3.5" /> Biriktirish
        </Button>
      </div>
    </div>
  );
}

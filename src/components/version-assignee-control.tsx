"use client";

// "Yangi versiya" so'rovlariga MAS'UL biriktirish — TP xodim va usta bitta
// ro'yxatda (boshliq holatga qarab kimni kerak bo'lsa shuni tanlaydi: masalan
// masofadan yangilansa xodim, joyida borish kerak bo'lsa usta). Umumiy
// muammolardagi ikki bosqichli (avval xodim, keyin usta) biriktiruvdan farqli
// — bu yerda faqat BITTA mas'ul bo'ladi.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, User as UserIcon, X } from "lucide-react";
import { assignTicketStaff, assignTicketUsta } from "@/actions/tickets";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type AssigneeOpt = { id: string; name: string; phone: string | null };
type Assigned = { id: string; name: string; phone: string | null } | null;

export function VersionAssigneeControl({
  ticketId,
  canAssign,
  staff,
  staffNote,
  usta,
  ustaNote,
  xodimlar,
  ustalar,
}: {
  ticketId: string;
  canAssign: boolean;
  staff: Assigned;
  staffNote: string | null;
  usta: Assigned;
  ustaNote: string | null;
  xodimlar: AssigneeOpt[];
  ustalar: AssigneeOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const [noteText, setNoteText] = useState("");

  const assigned = staff ?? usta;
  const note = staff ? staffNote : ustaNote;

  function remove() {
    start(async () => {
      const res = staff
        ? await assignTicketStaff(ticketId, null)
        : await assignTicketUsta(ticketId, null);
      if (res.ok) {
        toast("Biriktiruv olib tashlandi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  function assign() {
    if (!pick || !noteText.trim()) return;
    const [kind, id] = pick.split(":");
    start(async () => {
      const res =
        kind === "usta"
          ? await assignTicketUsta(ticketId, id, noteText)
          : await assignTicketStaff(ticketId, id, noteText);
      if (res.ok) {
        toast("Mas'ul biriktirildi", "success");
        setNoteText("");
        setPick("");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  if (assigned) {
    return (
      <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <UserIcon className="h-4 w-4 shrink-0 text-sky-500" />
          <span className="font-medium text-slate-800 dark:text-slate-200">
            Mas'ul: {assigned.name}
          </span>
          {assigned.phone && (
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <a href={`tel:${normalizePhone(assigned.phone)}`} className="text-primary-600 dark:text-primary-400">
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
              onClick={remove}
            >
              <X className="h-3.5 w-3.5" /> Olib tashlash
            </Button>
          )}
        </div>
        {note && (
          <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
            <span className="font-medium">Izoh:</span> {note}
          </p>
        )}
      </div>
    );
  }

  if (!canAssign) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Mas'ul biriktirilmagan (boshliq biriktiradi)
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          <UserIcon className="h-3.5 w-3.5 text-sky-500" /> Mas'ul:
        </span>
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
        >
          <option value="">Kishi tanlang…</option>
          <optgroup label="TP xodimlari">
            {xodimlar.map((u) => (
              <option key={u.id} value={`staff:${u.id}`}>
                {u.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Ustalar">
            {ustalar.map((u) => (
              <option key={u.id} value={`usta:${u.id}`}>
                {u.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Button size="sm" disabled={pending || !pick || !noteText.trim()} onClick={assign}>
          <Check className="h-3.5 w-3.5" /> Biriktirish
        </Button>
      </div>
      {pick && (
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Izoh (majburiy)…"
          className="w-full resize-y rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
        />
      )}
    </div>
  );
}

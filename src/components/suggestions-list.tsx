"use client";

// Mijoz takliflari ro'yxati (admin/menejer) — qidiruv + viloyat filtri, hal qilish.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, MapPin, Phone, Check, RotateCcw, Trash2, Clock } from "lucide-react";
import {
  resolveSuggestion,
  reopenSuggestion,
  deleteSuggestion,
} from "@/actions/suggestions";
import { confirmDialog } from "@/components/confirm-dialog";
import { ClientLink } from "@/components/client-link";
import { toast } from "@/components/toaster";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { SpecialNoteBell } from "@/components/special-note-bell";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type SuggestionItem = {
  id: string;
  body: string;
  status: string;
  clientId: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  createdByName: string | null;
  resolvedByName: string | null;
  createdAtFmt: string;
  resolvedAtFmt: string | null;
  overdue: boolean;
  specialNote: string | null;
  specialNoteBy: string | null;
  specialNoteAt: string | null;
};

export function SuggestionsList({ items }: { items: SuggestionItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [pending, start] = useTransition();

  const regions = useMemo(() => uniqueRegions(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (s) =>
          (!region || s.region === region) &&
          matchesQuery(query, s.restaurantName + " " + s.fullName + " " + s.body, s.phone),
      ),
    [items, query, region],
  );

  function onResolve(s: SuggestionItem) {
    start(async () => {
      const res = await resolveSuggestion(s.id);
      if (res.ok) {
        toast("Hal qilindi", "success");
        router.refresh();
      } else toast(res.error ?? "Xatolik", "error");
    });
  }

  function onReopen(s: SuggestionItem) {
    start(async () => {
      const res = await reopenSuggestion(s.id);
      if (res.ok) {
        toast("Qayta ochildi", "success");
        router.refresh();
      } else toast(res.error ?? "Xatolik", "error");
    });
  }

  async function onDelete(s: SuggestionItem) {
    const ok = await confirmDialog({
      title: "Taklifni o'chirish",
      message: `"${s.restaurantName}" taklifini o'chirasizmi? Bu amalni qaytarib bo'lmaydi.`,
      confirmLabel: "O'chirish",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteSuggestion(s.id);
      if (res.ok) {
        toast("O'chirildi", "success");
        router.refresh();
      } else toast(res.error ?? "Xatolik", "error");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
          <FoundCount found={filtered.length} total={items.length} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Lightbulb className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Taklif yo'q</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const resolved = s.status === "RESOLVED";
            return (
              <Card
                key={s.id}
                className={resolved ? "opacity-70" : s.overdue ? "border-amber-300 dark:border-amber-800" : ""}
              >
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <ClientLink id={s.clientId} name={s.restaurantName || s.fullName || "—"} />
                        <SpecialNoteBell
                          clientId={s.clientId}
                          restaurantName={s.restaurantName || s.fullName}
                          note={s.specialNote}
                          noteBy={s.specialNoteBy}
                          noteAt={s.specialNoteAt}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>{s.fullName}</span>
                        {s.region && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {s.region}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <a
                            href={`tel:${normalizePhone(s.phone)}`}
                            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                          >
                            <Phone className="h-3 w-3" />
                            {formatPhone(s.phone)}
                          </a>
                          <PhoneCopyButton phone={s.phone} />
                        </span>
                      </div>
                    </div>
                    {resolved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3 w-3" /> Hal qilindi
                      </span>
                    ) : s.overdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <Clock className="h-3 w-3" /> 1 oydan oshdi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 dark:bg-primary-950 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                        <Lightbulb className="h-3 w-3" /> Ochiq
                      </span>
                    )}
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                    {s.body}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {s.createdByName ? `Operator: ${s.createdByName} · ` : ""}
                    {s.createdAtFmt}
                    {resolved && s.resolvedByName ? ` · Hal qildi: ${s.resolvedByName}` : ""}
                    {resolved && s.resolvedAtFmt ? ` · ${s.resolvedAtFmt}` : ""}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {resolved ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onReopen(s)}
                        disabled={pending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Qayta ochish
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => onResolve(s)} disabled={pending}>
                        <Check className="h-3.5 w-3.5" /> Hal qilindi
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 dark:text-red-400"
                      onClick={() => onDelete(s)}
                      disabled={pending}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> O'chirish
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

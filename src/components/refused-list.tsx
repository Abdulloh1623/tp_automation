"use client";

// Otkaz mijozlar ro'yxati — qidiruv + viloyat filtri bilan.
import { useMemo, useState } from "react";
import { Ban, MapPin, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LeadRevertButton } from "@/components/lead-revert-button";
import { PhoneCopyButton } from "@/components/phone-copy";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type RefusedItem = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  operatorName: string | null;
  lastNote: string | null;
  lastNoteBy: string | null;
  lastNoteAtFmt: string | null;
};

export function RefusedList({
  items,
  isManager,
}: {
  items: RefusedItem[];
  isManager: boolean;
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");

  const regions = useMemo(() => uniqueRegions(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (c) =>
          (!region || c.region === region) &&
          matchesQuery(query, c.restaurantName + " " + c.fullName, c.phone),
      ),
    [items, query, region],
  );

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
        <Card className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Mijoz topilmadi
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {c.restaurantName}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{c.fullName}</span>
                      {c.region && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.region}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <a
                          href={`tel:${normalizePhone(c.phone)}`}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"
                        >
                          <Phone className="h-3 w-3" />
                          {formatPhone(c.phone)}
                        </a>
                        <PhoneCopyButton phone={c.phone} />
                      </span>
                      {c.operatorName && <span>· operator: {c.operatorName}</span>}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                    <Ban className="h-3 w-3" /> Otkaz
                  </span>
                </div>

                {c.lastNote && (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-sm text-slate-600 dark:text-slate-300">
                    Sabab: {c.lastNote}
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {c.lastNoteBy ? ` · ${c.lastNoteBy}` : ""}
                      {c.lastNoteAtFmt ? ` · ${c.lastNoteAtFmt}` : ""}
                    </span>
                  </div>
                )}

                {isManager && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      Mijoz qaytsa:
                    </span>
                    <LeadRevertButton clientId={c.id} label={c.restaurantName} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

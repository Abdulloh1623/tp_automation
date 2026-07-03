"use client";

// Eskalatsiya ro'yxatlari (yangi navbat + ustada) — qidiruv + viloyat filtri bilan.
import { useMemo, useState } from "react";
import { Phone, PhoneOff, MapPin, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AssignUstaForm } from "@/components/assign-usta-form";
import { UstaStatusControl } from "@/components/usta-status-control";
import { LeadRevertButton } from "@/components/lead-revert-button";
import { PhoneCopyButton } from "@/components/phone-copy";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import { ustaStatusLabel } from "@/lib/constants";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type EscalatedItem = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  operatorName: string | null;
  missedCallCount: number;
  specialNote: string | null;
  lastNote: string | null;
  suggestedUstaId: string | null;
};

export type ForwardedItem = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  ustaName: string | null;
  ustaPhone: string | null;
  ustaStatus: string | null;
};

export type UstaOption = {
  id: string;
  name: string;
  region: string | null;
  regions: string | null;
};

export function EscalationList({
  escalated,
  forwarded,
  ustalar,
  isManager,
}: {
  escalated: EscalatedItem[];
  forwarded: ForwardedItem[];
  ustalar: UstaOption[];
  isManager: boolean;
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");

  const regions = useMemo(
    () => uniqueRegions([...escalated, ...forwarded]),
    [escalated, forwarded],
  );
  const match = (c: { restaurantName: string; fullName: string; phone: string; region: string | null }) =>
    (!region || c.region === region) &&
    matchesQuery(query, c.restaurantName + " " + c.fullName, c.phone);

  const escFiltered = useMemo(() => escalated.filter(match), [escalated, query, region]); // eslint-disable-line react-hooks/exhaustive-deps
  const fwdFiltered = useMemo(() => forwarded.filter(match), [forwarded, query, region]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = escalated.length + forwarded.length;
  const found = escFiltered.length + fwdFiltered.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
          <FoundCount found={found} total={total} />
        </div>
      </div>

      {escFiltered.length === 0 && fwdFiltered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">
          {total === 0 ? "Navbat bo'sh — eskalatsiya qilingan lid yo'q" : "Mijoz topilmadi"}
        </Card>
      ) : (
        <>
          {escFiltered.length > 0 && (
            <div className="space-y-3">
              {escFiltered.map((c) => (
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
                      {c.missedCallCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                          <PhoneOff className="h-3 w-3" />
                          {c.missedCallCount} marta ko'tarilmagan
                        </span>
                      )}
                    </div>

                    {(c.specialNote || c.lastNote) && (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-sm text-slate-600 dark:text-slate-300">
                        {c.specialNote && (
                          <div className="text-amber-800 dark:text-amber-300">
                            Maxsus: {c.specialNote}
                          </div>
                        )}
                        {c.lastNote && <div>Oxirgi izoh: {c.lastNote}</div>}
                      </div>
                    )}

                    {isManager ? (
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                        <AssignUstaForm
                          clientId={c.id}
                          ustalar={ustalar}
                          suggestedUstaId={c.suggestedUstaId}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            Noto'g'ri yo'naltirilgan bo'lsa:
                          </span>
                          <LeadRevertButton clientId={c.id} label={c.restaurantName} />
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                          Usta biriktirilishi kutilmoqda
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {fwdFiltered.length > 0 && (
            <div className="space-y-3">
              <h2 className="pt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Ustada (jarayonda) — {fwdFiltered.length} ta
              </h2>
              {fwdFiltered.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{c.restaurantName}</div>
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
                          <span className="inline-flex items-center gap-1">
                            <Wrench className="h-3 w-3" /> {c.ustaName ?? "—"}
                          </span>
                          {c.ustaPhone && (
                            <span className="inline-flex items-center gap-1">
                              <a
                                href={`tel:${normalizePhone(c.ustaPhone)}`}
                                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"
                              >
                                <Phone className="h-3 w-3" />
                                {formatPhone(c.ustaPhone)}
                              </a>
                              <PhoneCopyButton phone={c.ustaPhone} />
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                        {ustaStatusLabel(c.ustaStatus ?? "ASSIGNED")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                      <UstaStatusControl clientId={c.id} current={c.ustaStatus} />
                      {isManager && <LeadRevertButton clientId={c.id} label={c.restaurantName} />}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

// Otkaz mijozlar ro'yxati — qidiruv + viloyat/usta filtri bilan.
//
// Uskuna qaytarib olish uchun kerak bo'ladigan kesim shu yerda: otkaz qilgan
// mijozning oyligi $29 dan yuqori bo'lsa — unda ijara uskunasi bor va uni usta
// olib kelishi kerak (BASE_PROGRAM_USD qoidasi, lib/constants.ts).
import { useMemo, useState } from "react";
import { Ban, MapPin, Phone, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientLink } from "@/components/client-link";
import { LeadRevertButton } from "@/components/lead-revert-button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { SpecialNoteBell } from "@/components/special-note-bell";
import { ClientNotFound } from "@/components/add-client-link";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import { formatMoney, formatPhone, normalizePhone } from "@/lib/utils";
import { BASE_PROGRAM_USD } from "@/lib/constants";

export type RefusedItem = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  operatorName: string | null;
  monthlyAmount: number;
  currency: string;
  /**
   * Oyligidan kelib chiqib mijozda BO'LISHI kerak bo'lgan ijara qiymati ($/oy) —
   * `expectedRentalValue` (lib/inventory-stats.ts) bilan serverda hisoblanadi.
   * 0 bo'lsa uskuna kutilmaydi (faqat dastur yoki UZS mijoz).
   */
  rentalValue: number;
  /** Biriktirilgan usta, bo'lmasa hudud bo'yicha taxmin (lib/usta-region.ts). */
  ustaId: string | null;
  ustaName: string | null;
  ustaByRegion: boolean;
  lastNote: string | null;
  lastNoteBy: string | null;
  lastNoteAtFmt: string | null;
  specialNote: string | null;
  specialNoteBy: string | null;
  specialNoteAt: string | null;
};

export function RefusedList({
  items,
  isManager,
  ustalar,
}: {
  items: RefusedItem[];
  isManager: boolean;
  ustalar: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [usta, setUsta] = useState("");
  const [onlyEquipped, setOnlyEquipped] = useState(false);

  const regions = useMemo(() => uniqueRegions(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (c) =>
          (!region || c.region === region) &&
          (!usta || (usta === "__none__" ? !c.ustaId : c.ustaId === usta)) &&
          (!onlyEquipped || c.rentalValue > 0) &&
          matchesQuery(query, c.restaurantName + " " + c.fullName, c.phone),
      ),
    [items, query, region, usta, onlyEquipped],
  );

  // Tanlangan kesimda kutilayotgan ijara qiymati — "qancha uskuna tashqarida"
  // degan savolning pul ko'rinishidagi javobi (faqat USD mijozlar hisoblanadi).
  const equippedCount = filtered.filter((c) => c.rentalValue > 0).length;
  const rentalTotal = filtered.reduce((s, c) => s + c.rentalValue, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
          <select
            value={usta}
            onChange={(e) => setUsta(e.target.value)}
            aria-label="Usta"
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Barcha ustalar</option>
            {ustalar.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            <option value="__none__">Usta yo&apos;q</option>
          </select>
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <input
              type="checkbox"
              checked={onlyEquipped}
              onChange={(e) => setOnlyEquipped(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary-600"
            />
            Uskunali (${BASE_PROGRAM_USD} dan yuqori)
          </label>
          <FoundCount found={filtered.length} total={items.length} />
        </div>
      </div>

      {equippedCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Bu kesimda <span className="font-semibold">{equippedCount}</span> ta mijozda ijara
          uskunasi bo&apos;lishi kerak — oyligi ${BASE_PROGRAM_USD} dan yuqori. Kutilayotgan ijara
          qiymati: <span className="font-semibold">{formatMoney(rentalTotal, "USD")}/oy</span>.
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-6">
          <ClientNotFound
            query={query}
            hint="Bu navbatda topilmadi — mijoz bazada bo‘lishi, lekin bu ro‘yxatga tushmagan bo‘lishi mumkin."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <ClientLink id={c.id} name={c.restaurantName || c.fullName || "—"} />
                      <SpecialNoteBell
                        clientId={c.id}
                        restaurantName={c.restaurantName || c.fullName}
                        note={c.specialNote}
                        noteBy={c.specialNoteBy}
                        noteAt={c.specialNoteAt}
                      />
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
                          className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                        >
                          <Phone className="h-3 w-3" />
                          {formatPhone(c.phone)}
                        </a>
                        <PhoneCopyButton phone={c.phone} />
                      </span>
                      {c.operatorName && <span>· operator: {c.operatorName}</span>}
                      {c.ustaName && (
                        <span className="inline-flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          usta: {c.ustaName}
                          {c.ustaByRegion && (
                            <span className="text-slate-400 dark:text-slate-500">(hudud)</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.monthlyAmount > 0 && (
                      <span
                        className={
                          c.rentalValue > 0
                            ? "inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
                            : "inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300"
                        }
                        title={
                          c.rentalValue > 0
                            ? `Ijara qiymati: ${formatMoney(c.rentalValue, "USD")}/oy — uskuna qaytarib olinishi kerak`
                            : `Faqat dastur — ijara uskunasi kutilmaydi`
                        }
                      >
                        {formatMoney(c.monthlyAmount, c.currency)}/oy
                        {c.rentalValue > 0 && ` · uskuna ${formatMoney(c.rentalValue, "USD")}`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                      <Ban className="h-3 w-3" /> Otkaz
                    </span>
                  </div>
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

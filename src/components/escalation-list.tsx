"use client";

// Eskalatsiya ro'yxatlari — ichki bo'limlarga (tab) ajratilgan:
// Yangi (xodim biriktirilmagan) · Biriktirilgan (xodim ishlayapti, usta yo'q) ·
// Ustada (jarayonda). Qidiruv + viloyat filtri barcha bo'limlarga ta'sir qiladi.
import { useMemo, useState, type ReactNode } from "react";
import {
  Phone,
  PhoneOff,
  MapPin,
  Wrench,
  AlertTriangle,
  Inbox,
  UserCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientLink } from "@/components/client-link";
import { AssignUstaForm } from "@/components/assign-usta-form";
import { UstaStatusControl } from "@/components/usta-status-control";
import { LeadRevertButton } from "@/components/lead-revert-button";
import {
  AssignEscalationStaff,
  type StaffOption,
} from "@/components/assign-escalation-staff";
import { PhoneCopyButton } from "@/components/phone-copy";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
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
  staffId: string | null;
  staffName: string | null;
  overdue: boolean;
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
  staffId: string | null;
  staffName: string | null;
  overdue: boolean;
};

/** 3 kundan oshgan eskalatsiya belgisi. */
function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
      <AlertTriangle className="h-3 w-3" /> 3 kundan oshgan
    </span>
  );
}

/** Bo'lim ichi bo'sh bo'lsa nozik ko'rsatkich. */
function EmptyPanel({ hint }: { hint: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500">
      {hint}
    </p>
  );
}

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
  staffOptions,
  isManager,
}: {
  escalated: EscalatedItem[];
  forwarded: ForwardedItem[];
  ustalar: UstaOption[];
  staffOptions: StaffOption[];
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

  // ESCALATED ichida: xodim biriktirilmagan (yangi) va biriktirilgan (jarayonda).
  const yangi = useMemo(() => escFiltered.filter((c) => !c.staffId), [escFiltered]);
  const biriktirilgan = useMemo(() => escFiltered.filter((c) => !!c.staffId), [escFiltered]);

  const total = escalated.length + forwarded.length;
  const found = escFiltered.length + fwdFiltered.length;

  // ESCALATED bosqichidagi mijoz kartasi (usta hali biriktirilmagan).
  function escalatedCard(c: EscalatedItem) {
    return (
      <Card key={c.id}>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <ClientLink id={c.id} name={c.restaurantName || c.fullName || "—"} />
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
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {c.overdue && <OverdueBadge />}
              {c.missedCallCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                  <PhoneOff className="h-3 w-3" />
                  {c.missedCallCount} marta ko'tarilmagan
                </span>
              )}
            </div>
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

          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            {/* Mas'ul xodim — jarayonni yakuniga yetkazadi (hamma ko'radi) */}
            <AssignEscalationStaff
              clientId={c.id}
              staffId={c.staffId}
              staffName={c.staffName}
              options={staffOptions}
              canAssign={isManager}
            />
            {isManager ? (
              <>
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
              </>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                Usta biriktirilishi kutilmoqda
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // FORWARDED bosqichidagi mijoz kartasi (usta biriktirilgan, jarayonda).
  function forwardedCard(c: ForwardedItem) {
    return (
      <Card key={c.id}>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <ClientLink id={c.id} name={c.restaurantName || c.fullName || "—"} />
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
                <span className="inline-flex items-center gap-1">
                  <Wrench className="h-3 w-3" /> {c.ustaName ?? "—"}
                </span>
                {c.ustaPhone && (
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={`tel:${normalizePhone(c.ustaPhone)}`}
                      className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                    >
                      <Phone className="h-3 w-3" />
                      {formatPhone(c.ustaPhone)}
                    </a>
                    <PhoneCopyButton phone={c.ustaPhone} />
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {c.overdue && <OverdueBadge />}
              <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                {ustaStatusLabel(c.ustaStatus ?? "ASSIGNED")}
              </span>
            </div>
          </div>
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <AssignEscalationStaff
              clientId={c.id}
              staffId={c.staffId}
              staffName={c.staffName}
              options={staffOptions}
              canAssign={isManager}
            />
            <div className="flex flex-wrap items-center gap-2">
              <UstaStatusControl clientId={c.id} current={c.ustaStatus} />
              {isManager && <LeadRevertButton clientId={c.id} label={c.restaurantName} />}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Bo'lim ichi: kartalar ro'yxati yoki bo'sh ko'rsatkich.
  function panel<T>(items: T[], render: (c: T) => ReactNode, emptyHint: string) {
    if (items.length === 0) return <EmptyPanel hint={emptyHint} />;
    return <div className="space-y-3">{items.map(render)}</div>;
  }

  const tabs: TicketTab[] = [];
  // "Yangi" (xodim biriktirilmagan) — faqat boshliq/admin biriktira oladi.
  if (isManager) {
    tabs.push({
      key: "yangi",
      label: "Yangi",
      icon: <Inbox className="h-4 w-4" />,
      tone: "red",
      count: yangi.length,
      content: panel(yangi, escalatedCard, "Biriktirilmagan yangi eskalatsiya yo'q."),
    });
  }
  tabs.push({
    key: "biriktirilgan",
    label: "Biriktirilgan",
    icon: <UserCheck className="h-4 w-4" />,
    tone: isManager ? "amber" : "red",
    count: biriktirilgan.length,
    content: panel(
      biriktirilgan,
      escalatedCard,
      isManager
        ? "Xodimga biriktirilgan (usta kutayotgan) eskalatsiya yo'q."
        : "Sizga biriktirilgan eskalatsiya yo'q.",
    ),
  });
  tabs.push({
    key: "ustada",
    label: "Ustada (jarayonda)",
    icon: <Wrench className="h-4 w-4" />,
    tone: "sky",
    count: fwdFiltered.length,
    content: panel(fwdFiltered, forwardedCard, "Ustada (jarayonda) eskalatsiya yo'q."),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
          <FoundCount found={found} total={total} />
        </div>
      </div>

      {total === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Navbat bo'sh — eskalatsiya qilingan lid yo'q
        </Card>
      ) : found === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Mijoz topilmadi
        </Card>
      ) : (
        <TicketTabs tabs={tabs} initialKey={isManager ? "yangi" : "biriktirilgan"} />
      )}
    </div>
  );
}

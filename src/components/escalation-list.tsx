"use client";

// Eskalatsiya ro'yxatlari — ichki bo'limlarga (tab) ajratilgan:
// Yangi (mas'ul biriktirilmagan — operatori yo'q) · Biriktirildi (mas'ul/operator
// bor, usta kutilmoqda) · Jarayonda (usta biriktirilgan — FORWARDED) · Yakunlangan.
// Mas'ul mijoz operatoriga qarab AVTOMAT biriktiriladi (operatorli lid darhol
// Biriktirildi'ga tushadi). Qidiruv + viloyat filtri barcha bo'limlarga ta'sir qiladi.
import { useMemo, useState, type ReactNode } from "react";
import {
  Phone,
  PhoneOff,
  MapPin,
  Wrench,
  AlertTriangle,
  Inbox,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientLink } from "@/components/client-link";
import { AssignUstaForm } from "@/components/assign-usta-form";
import { UstaStatusControl } from "@/components/usta-status-control";
import { LeadRevertButton } from "@/components/lead-revert-button";
import { ResolveEscalationButton } from "@/components/resolve-escalation-button";
import {
  AssignEscalationStaff,
  type StaffOption,
} from "@/components/assign-escalation-staff";
import { PhoneCopyButton } from "@/components/phone-copy";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
import { ClientNotFound } from "@/components/add-client-link";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import { ustaStatusLabel } from "@/lib/constants";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";

// Boshida ko'rsatiladigan yakunlangan kartalar soni ("Yana ko'rsatish" oshiradi).
const RESOLVED_PAGE = 20;

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

export type ResolvedItem = {
  id: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  ustaName: string | null;
  ustaPhone: string | null;
  operatorName: string | null;
  resolvedAt: string;
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
  resolved,
  ustalar,
  staffOptions,
  isManager,
}: {
  escalated: EscalatedItem[];
  forwarded: ForwardedItem[];
  resolved: ResolvedItem[];
  ustalar: UstaOption[];
  staffOptions: StaffOption[];
  isManager: boolean;
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  // Yakunlangan bo'limi: sana oralig'i (yyyy-mm-dd) va ko'rsatilgan kartalar soni.
  const [resFrom, setResFrom] = useState("");
  const [resTo, setResTo] = useState("");
  const [resShown, setResShown] = useState(RESOLVED_PAGE);

  const regions = useMemo(
    () => uniqueRegions([...escalated, ...forwarded, ...resolved]),
    [escalated, forwarded, resolved],
  );
  const match = (c: { restaurantName: string; fullName: string; phone: string; region: string | null }) =>
    (!region || c.region === region) &&
    matchesQuery(query, c.restaurantName + " " + c.fullName, c.phone);

  const escFiltered = useMemo(() => escalated.filter(match), [escalated, query, region]); // eslint-disable-line react-hooks/exhaustive-deps
  const fwdFiltered = useMemo(() => forwarded.filter(match), [forwarded, query, region]); // eslint-disable-line react-hooks/exhaustive-deps
  const resFiltered = useMemo(() => resolved.filter(match), [resolved, query, region]); // eslint-disable-line react-hooks/exhaustive-deps

  // Yangi = mas'ul (operator) biriktirilmagan (ESCALATED, staffId yo'q).
  // Biriktirildi = mas'ul bor, usta kutilmoqda (ESCALATED, staffId bor).
  // Jarayonda = usta biriktirilgan (FORWARDED — barchasi).
  const yangi = useMemo(() => escFiltered.filter((c) => !c.staffId), [escFiltered]);
  const biriktirildi = useMemo(() => escFiltered.filter((c) => c.staffId), [escFiltered]);
  const jarayonda = fwdFiltered;

  // Yakunlangan — qidiruv/viloyat ustiga sana oralig'i filtri (yakunlangan kun bo'yicha).
  const resDateFiltered = useMemo(
    () =>
      resFiltered.filter((c) => {
        const day = c.resolvedAt.slice(0, 10); // ISO'dan yyyy-mm-dd
        return (!resFrom || day >= resFrom) && (!resTo || day <= resTo);
      }),
    [resFiltered, resFrom, resTo],
  );

  const total = escalated.length + forwarded.length + resolved.length;
  const found = escFiltered.length + fwdFiltered.length + resFiltered.length;

  // ESCALATED bosqichidagi mijoz kartasi. `showUsta` — "Biriktirildi" bo'limida
  // (mas'ul bor) usta biriktirish formasi ko'rsatiladi; "Yangi"da esa mas'ul
  // biriktirilishini kutish holati.
  function escalatedCard(c: EscalatedItem, showUsta = false) {
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
            {/* Mas'ul xodim (operator) — jarayonni yakuniga yetkazadi (hamma ko'radi) */}
            <AssignEscalationStaff
              clientId={c.id}
              staffId={c.staffId}
              staffName={c.staffName}
              options={staffOptions}
              canAssign={isManager}
            />
            {showUsta ? (
              // Biriktirildi: mas'ul TP xodim (operator) yoki boshliq ustani biriktiradi
              <AssignUstaForm
                clientId={c.id}
                ustalar={ustalar}
                suggestedUstaId={c.suggestedUstaId}
              />
            ) : (
              !isManager && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  Mas'ul biriktirilishi kutilmoqda
                </span>
              )
            )}
            {isManager && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Noto'g'ri yo'naltirilgan bo'lsa:
                </span>
                <LeadRevertButton clientId={c.id} label={c.restaurantName} />
              </div>
            )}
            {/* Usta chaqirmasdan (masalan telefon orqali) hal qilinsa — to'g'ridan-to'g'ri yopish */}
            <ResolveEscalationButton clientId={c.id} label={c.restaurantName} />
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
              <ResolveEscalationButton clientId={c.id} label={c.restaurantName} />
              {isManager && <LeadRevertButton clientId={c.id} label={c.restaurantName} />}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Yakunlangan (RESOLVED — usta "Bajarildi" degan) mijoz kartasi (faqat ko'rsatish).
  function resolvedCard(c: ResolvedItem) {
    return (
      <Card key={c.id}>
        <CardContent className="space-y-2">
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
                {c.ustaName && (
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="h-3 w-3" /> {c.ustaName}
                  </span>
                )}
                {c.operatorName && <span>· operator: {c.operatorName}</span>}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> Yakunlandi · {formatDate(new Date(c.resolvedAt))}
            </span>
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

  const dateInputCls =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  // Yakunlangan bo'limi: sana oralig'i filtri + bosqichma-bosqich ko'rsatish.
  function resolvedPanel() {
    const shown = resDateFiltered.slice(0, resShown);
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Yakunlangan sana:</span>
          <input
            type="date"
            value={resFrom}
            max={resTo || undefined}
            onChange={(e) => {
              setResFrom(e.target.value);
              setResShown(RESOLVED_PAGE);
            }}
            className={dateInputCls}
            aria-label="Boshlanish sanasi"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={resTo}
            min={resFrom || undefined}
            onChange={(e) => {
              setResTo(e.target.value);
              setResShown(RESOLVED_PAGE);
            }}
            className={dateInputCls}
            aria-label="Tugash sanasi"
          />
          {(resFrom || resTo) && (
            <button
              type="button"
              onClick={() => {
                setResFrom("");
                setResTo("");
                setResShown(RESOLVED_PAGE);
              }}
              className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              Tozalash
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            {resDateFiltered.length} ta
          </span>
        </div>

        {resDateFiltered.length === 0 ? (
          <EmptyPanel hint="Tanlangan oraliqda yakunlangan eskalatsiya yo'q." />
        ) : (
          <>
            {shown.map(resolvedCard)}
            {resDateFiltered.length > resShown && (
              <button
                type="button"
                onClick={() => setResShown((n) => n + RESOLVED_PAGE)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60"
              >
                Yana ko'rsatish ({resDateFiltered.length - resShown} ta)
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  const tabs: TicketTab[] = [
    {
      key: "yangi",
      label: "Yangi",
      icon: <Inbox className="h-4 w-4" />,
      tone: "red", // mas'ul (operator) biriktirilishi kutilmoqda
      count: yangi.length,
      content: panel(yangi, (c) => escalatedCard(c), "Yangi (mas'ul biriktirilmagan) eskalatsiya yo'q."),
    },
    {
      key: "biriktirildi",
      label: "Biriktirildi",
      icon: <UserCheck className="h-4 w-4" />,
      tone: "amber", // mas'ul bor, usta kutilmoqda
      count: biriktirildi.length,
      content: panel(biriktirildi, (c) => escalatedCard(c, true), "Biriktirilgan (usta kutayotgan) eskalatsiya yo'q."),
    },
    {
      key: "jarayonda",
      label: "Jarayonda",
      icon: <Wrench className="h-4 w-4" />,
      tone: "sky", // usta biriktirilgan (yo'lda/bordi/...)
      count: jarayonda.length,
      content: panel(jarayonda, forwardedCard, "Jarayondagi (usta biriktirilgan) eskalatsiya yo'q."),
    },
    {
      key: "yakunlangan",
      label: "Yakunlangan",
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "emerald",
      count: resDateFiltered.length,
      content: resFiltered.length === 0 ? panel([], resolvedCard, "Yakunlangan eskalatsiya yo'q.") : resolvedPanel(),
    },
  ];

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
        <Card className="p-6">
          <ClientNotFound
            query={query}
            hint="Bu navbatda topilmadi — mijoz bazada bo‘lishi, lekin bu ro‘yxatga tushmagan bo‘lishi mumkin."
          />
        </Card>
      ) : (
        <TicketTabs tabs={tabs} initialKey="biriktirildi" />
      )}
    </div>
  );
}

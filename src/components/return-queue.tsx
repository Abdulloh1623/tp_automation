"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  AlertCircle,
  Phone,
  Wrench,
  PackageCheck,
  PlayCircle,
} from "lucide-react";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import {
  approveReturnRequest,
  rejectReturnRequest,
  startReturnProgress,
  confirmReturnCollected,
} from "@/actions/equipment";
import { Button } from "@/components/ui/button";
import { ClientLink } from "@/components/client-link";
import { Badge } from "@/components/ui/badge";
import { confirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PhoneCopyButton } from "@/components/phone-copy";
import { SpecialNoteBell } from "@/components/special-note-bell";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type ReturnQueueItem = {
  id: string;
  status: string; // PENDING | APPROVED | IN_PROGRESS | DONE
  clientId: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  specialNote: string | null;
  specialNoteBy: string | null;
  specialNoteAt: string | null;
  note: string | null;
  byName: string | null;
  ustaName: string | null; // biriktirilgan usta
  ustaPhone: string | null; // TP xodimi usta bilan bog'lanishi uchun
  matchedUstaId: string | null; // viloyat bo'yicha taklif (PENDING)
  resolvedAt: string | null; // DONE — uskuna qaytarilgan sana
};

export type UstaOpt = { id: string; name: string };

// Bo'limlar (status bo'yicha) — ustma-ust ko'rsatiladi.
const SECTIONS: {
  status: string;
  title: string;
  hint: string;
}[] = [
  {
    status: "PENDING",
    title: "Yangi",
    hint: "Usta biriktirilishi kutilmoqda",
  },
  {
    status: "APPROVED",
    title: "Biriktirilgan",
    hint: "Usta biriktirildi — jarayonni boshlang",
  },
  {
    status: "IN_PROGRESS",
    title: "Jarayonda",
    hint: "Usta yo'lda — uskuna olib kelingach yakunlang",
  },
  {
    status: "DONE",
    title: "Uskunalar qaytarilgan",
    hint: "Yakunlangan arizalar (oxirgi 50 ta)",
  },
];

export function ReturnQueue({
  items,
  ustalar,
  canAssign,
}: {
  items: ReturnQueueItem[];
  ustalar: UstaOpt[];
  canAssign: boolean; // ADMIN/MANAGER — usta biriktirish va rad etish
}) {
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");

  const regions = useMemo(() => uniqueRegions(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (r) =>
          (!region || r.region === region) &&
          matchesQuery(query, r.restaurantName + " " + r.fullName, r.phone),
      ),
    [items, query, region],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="Qaytariladigan uskunalar navbati bo'sh"
        hint="Operator lid holatini «Uskuna qaytarish kerak» qilsa, bu yerda paydo bo'ladi."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
          <FoundCount found={filtered.length} total={items.length} />
        </div>
      </div>
      {err && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}
      {SECTIONS.map((sec) => {
        const rows = filtered.filter((r) => r.status === sec.status);
        return (
          <section key={sec.status} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {sec.title}
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {rows.length}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{sec.hint}</span>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                Bo'sh
              </p>
            ) : (
              rows.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  ustalar={ustalar}
                  canAssign={canAssign}
                  onError={setErr}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({
  r,
  ustalar,
  canAssign,
  onError,
}: {
  r: ReturnQueueItem;
  ustalar: UstaOpt[];
  canAssign: boolean;
  onError: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ustaId, setUstaId] = useState<string>(r.matchedUstaId ?? "");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else onError(res.error ?? "Xatolik");
    });
  }

  const hasUsta = r.status === "APPROVED" || r.status === "IN_PROGRESS" || r.status === "DONE";
  const done = r.status === "DONE";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ClientLink id={r.clientId} name={r.restaurantName || r.fullName || "—"} />
            <SpecialNoteBell
              clientId={r.clientId}
              restaurantName={r.restaurantName || r.fullName}
              note={r.specialNote}
              noteBy={r.specialNoteBy}
              noteAt={r.specialNoteAt}
            />
            <Badge tone="slate">{r.region ?? "viloyatsiz"}</Badge>
            {r.status === "APPROVED" && <Badge tone="blue">Biriktirilgan</Badge>}
            {r.status === "IN_PROGRESS" && <Badge tone="amber">Jarayonda</Badge>}
            {done && <Badge tone="green">Qaytarildi</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{r.fullName}</span>
            <span className="inline-flex items-center gap-1">
              <a href={`tel:${normalizePhone(r.phone)}`} className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400">
                <Phone className="h-3 w-3" /> {formatPhone(r.phone)}
              </a>
              <PhoneCopyButton phone={r.phone} />
            </span>
            <span>· Ariza: {r.byName ?? "—"}</span>
            {done && r.resolvedAt && (
              <span>· Qaytarildi: {new Date(r.resolvedAt).toLocaleDateString("uz")}</span>
            )}
          </div>
          {r.note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.note}</p>}
          {hasUsta && (
            <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-700 dark:text-emerald-300">
              <span className="inline-flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Usta: {r.ustaName ?? "—"}
              </span>
              {!done && r.ustaPhone && (
                <span className="inline-flex items-center gap-1">
                  <a
                    href={`tel:${normalizePhone(r.ustaPhone)}`}
                    className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                  >
                    <Phone className="h-3 w-3" /> {formatPhone(r.ustaPhone)}
                  </a>
                  <PhoneCopyButton phone={r.ustaPhone} />
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {r.status === "DONE" ? null : r.status === "IN_PROGRESS" ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => confirmReturnCollected(r.id))}>
              <PackageCheck className="h-4 w-4" /> Bajarildi (olib keldi)
            </Button>
          ) : r.status === "APPROVED" ? (
            <>
              <Button size="sm" disabled={pending} onClick={() => run(() => startReturnProgress(r.id))}>
                <PlayCircle className="h-4 w-4" /> Jarayonga o'tkazish
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => confirmReturnCollected(r.id))}
              >
                <PackageCheck className="h-4 w-4" /> Bajarildi (olib keldi)
              </Button>
            </>
          ) : !canAssign ? (
            <Badge tone="amber">Usta biriktirilishi kutilmoqda</Badge>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <select
                  value={ustaId}
                  onChange={(e) => setUstaId(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
                >
                  <option value="">Usta tanlang (yoki viloyat bo'yicha)</option>
                  {ustalar.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => approveReturnRequest(r.id, ustaId || undefined))}
                >
                  <Check className="h-4 w-4" /> Biriktirish
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "Arizani rad etish",
                    message: `"${r.restaurantName || r.fullName}" uchun qaytarish arizasi rad etilsinmi?`,
                    confirmLabel: "Rad etish",
                  });
                  if (ok) run(() => rejectReturnRequest(r.id));
                }}
              >
                <X className="h-4 w-4" /> Rad etish
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

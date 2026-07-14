"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, AlertCircle, Phone, Wrench, PackageCheck } from "lucide-react";
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
  confirmReturnCollected,
} from "@/actions/equipment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PhoneCopyButton } from "@/components/phone-copy";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type ReturnQueueItem = {
  id: string;
  status: string; // PENDING | APPROVED
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  note: string | null;
  byName: string | null;
  ustaName: string | null; // biriktirilgan (APPROVED)
  ustaPhone: string | null; // TP xodimi usta bilan bog'lanishi uchun
  matchedUstaId: string | null; // viloyat bo'yicha taklif (PENDING)
};

export type UstaOpt = { id: string; name: string };

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
  const [status, setStatus] = useState<"" | "PENDING" | "APPROVED">("");

  const regions = useMemo(() => uniqueRegions(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (r) =>
          (!status || r.status === status) &&
          (!region || r.region === region) &&
          matchesQuery(query, r.restaurantName + " " + r.fullName, r.phone),
      ),
    [items, query, region, status],
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

  const chips: { key: "" | "PENDING" | "APPROVED"; label: string }[] = [
    { key: "", label: "Hammasi" },
    { key: "PENDING", label: "Yangi" },
    { key: "APPROVED", label: "Ustada" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={() => setStatus(ch.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (status === ch.key
                  ? "bg-primary-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")
              }
            >
              {ch.label}
            </button>
          ))}
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
          <FoundCount found={filtered.length} total={items.length} />
        </div>
      </div>
      {err && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}
      {filtered.map((r) => (
        <Row key={r.id} r={r} ustalar={ustalar} canAssign={canAssign} onError={setErr} />
      ))}
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

  const approved = r.status === "APPROVED";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">{r.restaurantName || r.fullName || "—"}</span>
            <Badge tone="slate">{r.region ?? "viloyatsiz"}</Badge>
            {approved && <Badge tone="amber">Ustada</Badge>}
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
          </div>
          {r.note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.note}</p>}
          {approved && (
            <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-700 dark:text-emerald-300">
              <span className="inline-flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Usta: {r.ustaName ?? "—"}
              </span>
              {r.ustaPhone && (
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
          {approved ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => confirmReturnCollected(r.id))}>
              <PackageCheck className="h-4 w-4" /> Bajarildi (olib keldi)
            </Button>
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

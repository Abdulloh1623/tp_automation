"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Undo2,
  Trash2,
  AlertCircle,
  Phone,
  FileText,
  MapPin,
  User,
  Landmark,
} from "lucide-react";
import {
  SearchInput,
  RegionSelect,
  FoundCount,
  matchesQuery,
  uniqueRegions,
} from "@/components/list-filter";
import {
  markTaxConnected,
  revertTaxConnection,
  deleteTaxConnection,
} from "@/actions/soliq";
import { Button } from "@/components/ui/button";
import { ClientLink } from "@/components/client-link";
import { confirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ClientNotFound } from "@/components/add-client-link";
import { PhoneCopyButton } from "@/components/phone-copy";
import { TAX_CONNECTION_STATUS } from "@/lib/constants";
import { formatPhone, normalizePhone } from "@/lib/utils";

export type SoliqQueueItem = {
  id: string;
  status: string; // PENDING | CONNECTED
  clientId: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  region: string | null;
  certificateNo: string;
  directorName: string;
  directorPhone: string;
  geoLink: string;
  note: string | null;
  certUrl: string | null;
  docUrl: string | null;
  byName: string | null;
  connectedByName: string | null;
  connectedAt: string | null;
  createdAt: string;
};

export function SoliqQueue({
  items,
  canManage,
}: {
  items: SoliqQueueItem[];
  canManage: boolean; // ADMIN/MANAGER — "Ulandi" belgilash, bekor qilish, o'chirish
}) {
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<"" | "PENDING" | "CONNECTED">("");

  const regions = useMemo(() => uniqueRegions(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (r) =>
          (!status || r.status === status) &&
          (!region || r.region === region) &&
          matchesQuery(query, r.restaurantName + " " + r.fullName + " " + r.directorName, r.phone),
      ),
    [items, query, region, status],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Soliqqa ulash navbati bo'sh"
        hint="Operator mijozni «Soliqqa ulash» tugmasi orqali yuborsa, bu yerda paydo bo'ladi."
      />
    );
  }

  const chips: { key: "" | "PENDING" | "CONNECTED"; label: string }[] = [
    { key: "", label: "Hammasi" },
    { key: "PENDING", label: "Kutilmoqda" },
    { key: "CONNECTED", label: "Ulangan" },
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
      {filtered.length === 0 ? (
        <ClientNotFound query={query} hint="Bu navbatda topilmadi — mijoz bazada bo‘lishi, lekin bu ro‘yxatga tushmagan bo‘lishi mumkin." />
      ) : (
        filtered.map((r) => (
          <Row key={r.id} r={r} canManage={canManage} onError={setErr} />
        ))
      )}
    </div>
  );
}

function Row({
  r,
  canManage,
  onError,
}: {
  r: SoliqQueueItem;
  canManage: boolean;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const connected = r.status === "CONNECTED";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else onError(res.error ?? "Xatolik");
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ClientLink id={r.clientId} name={r.restaurantName || r.fullName || "—"} />
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs font-medium " +
                (connected
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300")
              }
            >
              {TAX_CONNECTION_STATUS[r.status as keyof typeof TAX_CONNECTION_STATUS] ?? r.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{r.fullName}</span>
            {r.region && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {r.region}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <a
                href={`tel:${normalizePhone(r.phone)}`}
                className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
              >
                <Phone className="h-3 w-3" />
                {formatPhone(r.phone)}
              </a>
              <PhoneCopyButton phone={r.phone} />
            </span>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {!connected ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => markTaxConnected(r.id))}
              >
                <Check className="h-3.5 w-3.5" /> Ulandi
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => revertTaxConnection(r.id))}
              >
                <Undo2 className="h-3.5 w-3.5" /> Bekor qilish
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 dark:text-red-400"
              disabled={pending}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Arizani o'chirish",
                  message: "Soliqqa ulash arizasi o'chirilsinmi?",
                  confirmLabel: "O'chirish",
                });
                if (ok) run(() => deleteTaxConnection(r.id));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Tafsilotlar */}
      <div className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <Detail icon={<Landmark className="h-3.5 w-3.5" />} label="Guvohnoma">
          {r.certificateNo}
        </Detail>
        <Detail icon={<User className="h-3.5 w-3.5" />} label="Rahbar">
          {r.directorName}
          <a
            href={`tel:${normalizePhone(r.directorPhone)}`}
            className="ml-2 text-primary-600 dark:text-primary-400"
          >
            {formatPhone(r.directorPhone)}
          </a>
        </Detail>
        <Detail icon={<MapPin className="h-3.5 w-3.5" />} label="Geolokatsiya">
          <a
            href={r.geoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline dark:text-primary-400 break-all"
          >
            Xaritada ochish
          </a>
        </Detail>
        <Detail icon={<FileText className="h-3.5 w-3.5" />} label="Hujjatlar">
          <span className="flex flex-wrap gap-3">
            {r.certUrl && (
              <a href={r.certUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline dark:text-primary-400">
                Guvohnoma
              </a>
            )}
            {r.docUrl && (
              <a href={r.docUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline dark:text-primary-400">
                Kadastr/ijara
              </a>
            )}
          </span>
        </Detail>
      </div>

      {r.note && (
        <p className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="font-medium">Izoh:</span> {r.note}
        </p>
      )}

      <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        {r.byName ? `Yubordi: ${r.byName}` : ""}
        {connected && r.connectedByName ? ` · Ulaganini belgiladi: ${r.connectedByName}` : ""}
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-200">
      <span className="mt-0.5 text-slate-400 dark:text-slate-500">{icon}</span>
      <span>
        <span className="text-slate-500 dark:text-slate-400">{label}: </span>
        {children}
      </span>
    </div>
  );
}

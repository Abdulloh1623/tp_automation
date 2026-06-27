"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, AlertCircle, Phone, Wrench, PackageCheck } from "lucide-react";
import {
  approveReturnRequest,
  rejectReturnRequest,
  confirmReturnCollected,
} from "@/actions/equipment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { normalizePhone } from "@/lib/utils";

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
  matchedUstaId: string | null; // viloyat bo'yicha taklif (PENDING)
};

export type UstaOpt = { id: string; name: string };

export function ReturnQueue({
  items,
  ustalar,
}: {
  items: ReturnQueueItem[];
  ustalar: UstaOpt[];
}) {
  const [err, setErr] = useState<string | null>(null);

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
    <div className="space-y-3">
      {err && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}
      {items.map((r) => (
        <Row key={r.id} r={r} ustalar={ustalar} onError={setErr} />
      ))}
    </div>
  );
}

function Row({
  r,
  ustalar,
  onError,
}: {
  r: ReturnQueueItem;
  ustalar: UstaOpt[];
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
            <a href={`tel:${normalizePhone(r.phone)}`} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Phone className="h-3 w-3" /> {r.phone}
            </a>
            <span>· Ariza: {r.byName ?? "—"}</span>
          </div>
          {r.note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.note}</p>}
          {approved && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
              <Wrench className="h-3 w-3" /> Usta: {r.ustaName ?? "—"}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {approved ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => confirmReturnCollected(r.id))}>
              <PackageCheck className="h-4 w-4" /> Bajarildi (olib keldi)
            </Button>
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

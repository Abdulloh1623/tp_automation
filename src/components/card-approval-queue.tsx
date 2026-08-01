"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, FileText, X } from "lucide-react";
import { confirmCardPayment, rejectCardPayment } from "@/actions/card-payments";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/toaster";
import { confirmDialog } from "@/components/confirm-dialog";
import { CARD_REJECT_REASON, paymentMethodLabel } from "@/lib/constants";
import { formatDateTime, formatMoney, formatPhone } from "@/lib/utils";

export type CardApprovalItem = {
  id: string;
  clientId: string;
  restaurantName: string;
  fullName: string;
  phone: string;
  amount: number;
  currency: string;
  method: string;
  /** ISO — operator ko'rsatgan to'lov vaqti */
  paidAt: string;
  createdAt: string;
  recordedByName: string | null;
  receiptNote: string | null;
  isPdf: boolean;
  hasReceipt: boolean;
  /** Necha tasdiqlovchiga Telegram xabari yetib bordi (0 — hech kimga) */
  notified: number;
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} daqiqa oldin`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.floor(h / 24)} kun oldin`;
}

function timeOf(iso: string): string {
  // Intl EMAS: `uz-UZ` natijasi Node va brauzerda har xil (hydration mismatch).
  return formatDateTime(iso);
}

export function CardApprovalQueue({ items }: { items: CardApprovalItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  function run(id: string, fn: () => Promise<{ ok?: boolean; error?: string }>, okMsg: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (res.error) toast(res.error, "error");
      else if (res.ok) {
        toast(okMsg, "success");
        router.refresh();
      }
    });
  }

  async function onReject(it: CardApprovalItem) {
    const reason = reasons[it.id] ?? "NO_MONEY";
    const ok = await confirmDialog({
      title: "To'lovni rad etasizmi?",
      message:
        `${it.restaurantName} — ${formatMoney(it.amount, it.currency)}. ` +
        `To'lov qabul qilinmaydi, to'lovni kiritgan xodim va adminlarga bildirishnoma boradi.`,
      confirmLabel: "Rad etish",
      variant: "danger",
    });
    if (!ok) return;
    run(it.id, () => rejectCardPayment(it.id, reason), "To'lov rad etildi");
  }

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const busy = pending && busyId === it.id;
        return (
          <div
            key={it.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CreditCard className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {it.restaurantName}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    {paymentMethodLabel(it.method)}
                  </span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {it.fullName} · {formatPhone(it.phone)}
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {formatMoney(it.amount, it.currency)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  To&apos;lov vaqti: {timeOf(it.paidAt)} · kiritdi:{" "}
                  {it.recordedByName ?? "—"} · {ago(it.createdAt)}
                </div>
                {it.receiptNote && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    📝 {it.receiptNote}
                  </div>
                )}
                {it.notified === 0 && (
                  <div className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    ⚠️ Telegram xabari yuborilmadi — tasdiqlovchiga yetib bormagan
                    bo&apos;lishi mumkin
                  </div>
                )}
              </div>

              {it.hasReceipt && (
                <a
                  href={`/api/card-receipts/${it.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0"
                >
                  {it.isPdf ? (
                    <span className="flex h-24 w-24 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                      <FileText className="h-8 w-8" />
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/card-receipts/${it.id}`}
                      alt="Chek"
                      className="h-24 w-24 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                    />
                  )}
                </a>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-end dark:border-slate-800">
              <Select
                aria-label="Rad etish sababi"
                className="sm:w-56"
                value={reasons[it.id] ?? "NO_MONEY"}
                onChange={(e) =>
                  setReasons((r) => ({ ...r, [it.id]: e.target.value }))
                }
              >
                {Object.entries(CARD_REJECT_REASON).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onReject(it)}
              >
                <X className="mr-1 h-4 w-4" /> Rad etish
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(it.id, () => confirmCardPayment(it.id), "To'lov tasdiqlandi")
                }
              >
                <CheckCircle2 className="mr-1 h-4 w-4" /> Tasdiqlash
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

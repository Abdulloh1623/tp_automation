"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, AlertCircle } from "lucide-react";
import { updatePayment, deletePayment } from "@/actions/payments";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { CURRENCY, PAYMENT_METHOD } from "@/lib/constants";

export type EditablePayment = {
  id: string;
  amount: number;
  currency: string;
  method: string | null;
  paidAt: string; // ISO (sahifa toISOString bilan uzatadi)
  receiptNote: string | null;
};

// ISO sanani <input type="date"> uchun yyyy-MM-dd ga (lokal vaqt).
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PaymentHistoryActions({
  payment,
  canManage,
}: {
  payment: EditablePayment;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(String(payment.amount));
  const [currency, setCurrency] = useState(payment.currency);
  const [method, setMethod] = useState(payment.method ?? "CARD");
  const [paidAt, setPaidAt] = useState(isoToDateInput(payment.paidAt));
  const [note, setNote] = useState(payment.receiptNote ?? "");

  if (!canManage) return null;

  function saveEdit() {
    setError(null);
    const fd = new FormData();
    fd.set("amount", amount);
    fd.set("currency", currency);
    fd.set("method", method);
    if (paidAt) fd.set("paidAt", paidAt);
    if (note.trim()) fd.set("receiptNote", note.trim());
    start(async () => {
      const res = await updatePayment(payment.id, fd);
      if (res.ok) {
        setEditing(false);
        toast("To'lov tahrirlandi", "success");
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: "To'lov o'chirilsinmi?",
      message: "Yozuv va cheki o'chiriladi; keyingi to'lov sanasi qayta hisoblanadi.",
      confirmLabel: "O'chirish",
    });
    if (!ok) return;
    start(async () => {
      const res = await deletePayment(payment.id);
      if (res.ok) {
        toast("To'lov o'chirildi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Tahrirlash"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="O'chirish"
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                To&apos;lovni tahrirlash
              </h3>
              <button
                onClick={() => setEditing(false)}
                aria-label="Yopish"
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Summa</Label>
                  <MoneyInput value={amount} onValueChange={setAmount} />
                </div>
                <div>
                  <Label>Valyuta</Label>
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {Object.entries(CURRENCY).map(([key, label]) => (
                      <option key={key} value={key}>
                        {key} ({label})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>To&apos;lov usuli</Label>
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    {Object.entries(PAYMENT_METHOD).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>To&apos;lov sanasi</Label>
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Izoh</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ixtiyoriy" />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={saveEdit} loading={pending}>
                Saqlash
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Bekor
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

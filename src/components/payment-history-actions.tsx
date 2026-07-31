"use client";

// Mijoz profilidagi to'lov tarixi qatorining amallari: tahrirlash / o'chirish.
// Oynaning o'zi umumiy `Modal` qobig'ida (portal + balandlik qoidalari o'sha
// yerda izohlangan).

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, AlertCircle, ReceiptText } from "lucide-react";
import { updatePayment, deletePayment } from "@/actions/payments";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
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
  /**
   * Server tomonda formatlangan ko'rinish ("350 000 so'm · 12/07/2026").
   * Brauzerning ICU'si `uz-UZ` ni boshqacha yozadi ("350,000" / "2026-07-12"),
   * shu sabab bu yerda qayta formatlamaymiz — aks holda oynadagi qiymat orqada
   * turgan jadval qatoridan farq qilib, chalkash ko'rinadi.
   */
  label: { amount: string; date: string; method: string };
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

  const close = useCallback(() => setEditing(false), []);

  /** Oyna ochilganda maydonlar doim yozuvning joriy qiymatidan boshlansin. */
  function openEdit() {
    setError(null);
    setAmount(String(payment.amount));
    setCurrency(payment.currency);
    setMethod(payment.method ?? "CARD");
    setPaidAt(isoToDateInput(payment.paidAt));
    setNote(payment.receiptNote ?? "");
    setEditing(true);
  }

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
        toast("To'lov tahrirlandi — hisobotlar yangilandi", "success");
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
  const dialog = (
    <Modal
      open={editing}
      onClose={close}
      title="To'lovni tahrirlash"
      icon={<ReceiptText className="h-4 w-4" />}
      note={
        <>
          Hozirgi:{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {payment.label.amount}
          </span>{" "}
          · {payment.label.date} · {payment.label.method}
        </>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={pending}>
            Bekor
          </Button>
          <Button size="sm" onClick={saveEdit} loading={pending}>
            Saqlash
          </Button>
        </>
      }
    >
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`amount-${payment.id}`}>Summa</Label>
          <MoneyInput id={`amount-${payment.id}`} value={amount} onValueChange={setAmount} />
        </div>
        <div>
          <Label htmlFor={`currency-${payment.id}`}>Valyuta</Label>
          <Select
            id={`currency-${payment.id}`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {Object.entries(CURRENCY).map(([key, label]) => (
              <option key={key} value={key}>
                {key} ({label})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`method-${payment.id}`}>To&apos;lov usuli</Label>
          <Select
            id={`method-${payment.id}`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {Object.entries(PAYMENT_METHOD).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`paid-${payment.id}`}>To&apos;lov sanasi</Label>
          <Input
            id={`paid-${payment.id}`}
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`note-${payment.id}`}>Izoh</Label>
        <Input
          id={`note-${payment.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ixtiyoriy"
        />
      </div>
    </Modal>
  );

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openEdit}
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

      {dialog}
    </>
  );
}

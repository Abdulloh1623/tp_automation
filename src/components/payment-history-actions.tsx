"use client";

// Mijoz profilidagi to'lov tarixi qatorining amallari: tahrirlash / o'chirish.
//
// Tahrirlash oynasi PORTAL orqali `document.body`ga chiqariladi. NEGA: profil
// modali (`ProfileModalShell`) `backdrop-blur` ishlatadi, backdrop-filter esa
// ichidagi `position: fixed` elementlar uchun YANGI containing block yaratadi.
// Natijada oyna viewport'ga emas, uzun profil scroll-konteyneriga nisbatan
// joylashardi — "inset-0" butun scroll balandligini qoplab, oyna bahaybat va
// tushunarsiz ko'rinishda ochilardi. Portal bilan u yana viewport'ga bog'lanadi.
//
// Ko'rinish tili — DocumentViewer/profil modali bilan bir xil: sarlavha ikon
// chipi, hozirgi qiymatlar meta-tasmasi, forma va pastdagi amallar paneli.

import { useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, AlertCircle, ReceiptText } from "lucide-react";
import { updatePayment, deletePayment } from "@/actions/payments";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { formatDate, formatMoney } from "@/lib/utils";
import { CURRENCY, PAYMENT_METHOD, type PaymentMethod } from "@/lib/constants";

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

function methodLabel(method: string | null): string {
  if (!method) return "—";
  return PAYMENT_METHOD[method as PaymentMethod] ?? method;
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
  // Portal faqat brauzerda (SSR'da document yo'q)
  const [mounted, setMounted] = useState(false);

  const [amount, setAmount] = useState(String(payment.amount));
  const [currency, setCurrency] = useState(payment.currency);
  const [method, setMethod] = useState(payment.method ?? "CARD");
  const [paidAt, setPaidAt] = useState(isoToDateInput(payment.paidAt));
  const [note, setNote] = useState(payment.receiptNote ?? "");

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setEditing(false), []);

  // Escape bilan yopish + orqa fon scroll qilmasin (boshqa modallar kabi)
  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation(); // profil modali ham yopilib ketmasin
        close();
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [editing, close]);

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
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/50 p-2 backdrop-blur-md sm:p-6"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="To'lovni tahrirlash"
    >
      <div
        className="relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-950 dark:ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hi-Tech aksent chizig'i — profil/hujjat modallari bilan bir xil */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/70 to-transparent" />

        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400">
              <ReceiptText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                To&apos;lovni tahrirlash
              </h2>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                O&apos;zgarish hisobotlarga darhol tushadi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Yopish"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hozirgi qiymatlar — nimani o'zgartirayotgani ko'rinib tursin */}
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40">
          {[
            { label: "Hozirgi summa", value: formatMoney(payment.amount, payment.currency) },
            { label: "Sana", value: formatDate(payment.paidAt) },
            { label: "Usul", value: methodLabel(payment.method) },
          ].map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-xs text-slate-500 dark:text-slate-400">{m.label}</dt>
              <dd className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`amount-${payment.id}`}>Summa</Label>
              <MoneyInput
                id={`amount-${payment.id}`}
                value={amount}
                onValueChange={setAmount}
              />
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
            <Textarea
              id={`note-${payment.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="min-h-[64px]"
              placeholder="Ixtiyoriy"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          <Button variant="ghost" onClick={close} disabled={pending}>
            Bekor
          </Button>
          <Button onClick={saveEdit} loading={pending}>
            Saqlash
          </Button>
        </div>
      </div>
    </div>
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

      {editing && mounted && createPortal(dialog, document.body)}
    </>
  );
}

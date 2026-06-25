"use client";

import { useState, useTransition } from "react";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";
import { recordLeadPayment } from "@/actions/payments";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ReceiptInput } from "@/components/receipt-input";
import { CURRENCY } from "@/lib/constants";

export type PayTarget = {
  id: string;
  restaurantName: string;
  monthlyAmount: number;
  currency: string;
};

export function PaymentReceiptModal({
  target,
  onClose,
  onDone,
}: {
  target: PayTarget;
  onClose: () => void;
  onDone: (clientId: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [amount, setAmount] = useState(String(target.monthlyAmount));
  const [currency, setCurrency] = useState(target.currency);
  const [months, setMonths] = useState("1");
  const [note, setNote] = useState("");

  function submit() {
    setError(null);
    if (!receipt) {
      setError("Chek rasmi majburiy");
      return;
    }
    const fd = new FormData();
    fd.set("amount", amount);
    fd.set("currency", currency);
    fd.set("months", months);
    if (note) fd.set("receiptNote", note);
    fd.set("receipt", receipt);
    start(async () => {
      const res = await recordLeadPayment(target.id, fd);
      if (res.ok) onDone(target.id);
      else setError(res.error ?? "Xatolik");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> To'lov cheki — {target.restaurantName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Summa</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
              <Label>Necha oyga</Label>
              <Input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} />
            </div>
            <div>
              <Label>Izoh</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" />
            </div>
          </div>
          <div>
            <Label>Chek (rasm) *</Label>
            <ReceiptInput onChange={setReceipt} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={submit} disabled={pending}>
            {pending ? "Yuborilmoqda..." : "Tasdiqlash va yuborish"}
          </Button>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
        </div>
      </div>
    </div>
  );
}

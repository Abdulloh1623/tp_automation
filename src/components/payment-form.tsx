"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { recordPayment } from "@/actions/payments";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ReceiptInput } from "@/components/receipt-input";
import { CURRENCY } from "@/lib/constants";

export function PaymentForm({
  clientId,
  defaultAmount,
  defaultCurrency,
}: {
  clientId: string;
  defaultAmount: number;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);

  const [amount, setAmount] = useState(String(defaultAmount));
  const [currency, setCurrency] = useState(defaultCurrency);
  const [months, setMonths] = useState("1");
  const [paidAt, setPaidAt] = useState("");
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
    if (paidAt) fd.set("paidAt", paidAt);
    if (note) fd.set("receiptNote", note);
    fd.set("receipt", receipt);
    start(async () => {
      const res = await recordPayment(clientId, fd);
      if (res.ok) {
        setDone(true);
        setReceipt(null);
        setNote("");
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> To'lov qabul qilindi va to'lovlar
        kanaliga yuborildi.
        <button className="ml-auto underline" onClick={() => setDone(false)}>
          Yana
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
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
          <Label>To'lov sanasi</Label>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Izoh</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="masalan: karta orqali" />
      </div>
      <div>
        <Label>Chek (rasm) *</Label>
        <ReceiptInput onChange={setReceipt} />
      </div>
      <Button size="sm" disabled={pending} onClick={submit}>
        <CheckCircle2 className="h-4 w-4" />
        {pending ? "Saqlanmoqda..." : "To'lovni qabul qilish"}
      </Button>
    </div>
  );
}

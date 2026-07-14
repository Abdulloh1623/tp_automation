"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { recordPayment } from "@/actions/payments";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ReceiptInput } from "@/components/receipt-input";
import { CURRENCY, PAYMENT_METHOD } from "@/lib/constants";

// Bugungi sanani <input type="date"> uchun yyyy-MM-dd ko'rinishida (lokal vaqt).
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PaymentForm({
  clientId,
  defaultAmount,
}: {
  clientId: string;
  defaultAmount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);

  const [amount, setAmount] = useState(String(defaultAmount));
  const [currency, setCurrency] = useState("UZS");
  const [days, setDays] = useState("30");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState("CARD");

  function submit() {
    setError(null);
    if (!receipt) {
      setError("Chek rasmi majburiy");
      return;
    }
    const fd = new FormData();
    fd.set("amount", amount);
    fd.set("currency", currency);
    fd.set("days", days);
    if (paidAt) fd.set("paidAt", paidAt);
    fd.set("method", method);
    fd.set("receipt", receipt);
    start(async () => {
      const res = await recordPayment(clientId, fd);
      if (res.ok) {
        setDone(true);
        setReceipt(null);
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
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
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
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
          <Label>Necha kunga</Label>
          <Input type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div>
          <Label>To'lov sanasi</Label>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>To'lov usuli</Label>
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHOD).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Chek (rasm) *</Label>
        <ReceiptInput onChange={setReceipt} />
      </div>
      <Button size="sm" loading={pending} onClick={submit}>
        {!pending && <CheckCircle2 className="h-4 w-4" />}
        {pending ? "Saqlanmoqda..." : "To'lovni qabul qilish"}
      </Button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, Search, X } from "lucide-react";
import {
  confirmPendingPayment,
  rejectPendingPayment,
  searchClientsForReceipt,
} from "@/actions/pending-payments";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/confirm-dialog";
import { CURRENCY, PAYMENT_METHOD } from "@/lib/constants";
import { formatPhone } from "@/lib/utils";

export type AmountCandidate = {
  value: number;
  label: string | null;
  currency: "UZS" | "USD" | null;
};

export type PendingReceiptItem = {
  id: string;
  senderName: string | null;
  rawText: string | null;
  parsedName: string | null;
  parsedPhone: string | null;
  sheetNo: string | null;
  receiptMime: string | null;
  isPdf: boolean;
  suggestedClientId: string | null;
  suggestedClientLabel: string | null;
  receivedAt: string;
  /** HISTORY — guruh eksportidan import qilingan eski chek. */
  isHistorical: boolean;
  /** Tarixiy chekda to'lovning haqiqiy sanasi (ISO). */
  occurredAt: string | null;
  /** OCR taxmin qilgan summa (bo'lsa). */
  suggestedAmount: number | null;
  suggestedCurrency: string | null;
  amountConfidence: "high" | "low" | "none" | null;
  /** Bir chekda bir necha summa bo'lsa — operator tanlaydi. */
  amountCandidates: AmountCandidate[];
};

/** ISO sanadan <input type="date"> qiymati (lokal kun). */
function isoToDateInput(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bugungi sanani <input type="date"> uchun yyyy-MM-dd ko'rinishida. */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PendingReceiptsQueue({ items }: { items: PendingReceiptItem[] }) {
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Telegram &laquo;To&apos;lov cheklari&raquo; guruhidan kelgan cheklar. Summani chekka
        qarab kiriting va tasdiqlang &mdash; shundan keyin to&apos;lov yoziladi.
      </p>
      {err && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}
      {items.map((it) => (
        <PendingRow key={it.id} it={it} onError={setErr} />
      ))}
    </div>
  );
}

function PendingRow({
  it,
  onError,
}: {
  it: PendingReceiptItem;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [clientId, setClientId] = useState(it.suggestedClientId ?? "");
  const [clientLabel, setClientLabel] = useState(it.suggestedClientLabel ?? "");
  // OCR taxmini oldindan to'ldiriladi — operator baribir chekka qarab tekshiradi
  const [amount, setAmount] = useState(
    it.suggestedAmount !== null ? String(it.suggestedAmount) : "",
  );
  const [currency, setCurrency] = useState(it.suggestedCurrency ?? "UZS");
  const [days, setDays] = useState("30");
  // Tarixiy chekda to'lov sanasi — chek guruhga tashlangan kun, bugun EMAS
  const [paidAt, setPaidAt] = useState(isoToDateInput(it.occurredAt) ?? todayIso());
  const [method, setMethod] = useState("CARD");

  function confirm() {
    onError(null);
    if (!clientId) {
      onError("Mijozni tanlang");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      onError("Summani kiriting");
      return;
    }
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("amount", amount);
    fd.set("currency", currency);
    fd.set("days", days);
    if (paidAt) fd.set("paidAt", paidAt);
    fd.set("method", method);
    if (it.sheetNo) fd.set("receiptNote", `Telegram cheki · eski ro'yxat №${it.sheetNo}`);
    start(async () => {
      const res = await confirmPendingPayment(it.id, fd);
      if (res.ok) router.refresh();
      else onError(res.error ?? "Xatolik");
    });
  }

  async function reject() {
    onError(null);
    // Dialog transition'dan TASHQARIDA kutiladi — aks holda operator o'ylab
    // turgan vaqtida butun kartochka "saqlanmoqda" holatida qotib qoladi.
    const ok = await confirmDialog({
      title: "Chekni rad etish",
      message: "Bu chek navbatdan olib tashlansinmi? Fayl o'chiriladi.",
      confirmLabel: "Rad etish",
    });
    if (!ok) return;
    start(async () => {
      const res = await rejectPendingPayment(it.id);
      if (res.ok) router.refresh();
      else onError(res.error ?? "Xatolik");
    });
  }

  const receiptUrl = `/api/pending-receipts/${it.id}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        {/* Chek */}
        <a
          href={receiptUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block shrink-0"
          title="Chekni to'liq ochish"
        >
          {it.isPdf ? (
            <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <FileText className="h-8 w-8" />
              <span className="text-xs font-medium">PDF chek — ochish</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receiptUrl}
              alt="Chek"
              className="h-40 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-700"
            />
          )}
        </a>

        <div className="min-w-0 space-y-3">
          {/* Telegramdan kelgan matn */}
          <div>
            {it.rawText ? (
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                {it.rawText}
              </p>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                Bu chekka matn biriktirilmagan — mijozni qo&apos;lda tanlang.
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400 dark:text-slate-500">
              {it.senderName && <span>Yubordi: {it.senderName}</span>}
              {it.parsedPhone && <span>Telefon: {formatPhone(it.parsedPhone)}</span>}
              {it.sheetNo && <span>Eski ro&apos;yxat №{it.sheetNo}</span>}
              <span>{new Date(it.receivedAt).toLocaleString("uz-UZ")}</span>
            </div>
          </div>

          {/* Mijoz */}
          <ClientPicker
            clientId={clientId}
            label={clientLabel}
            autoMatched={!!it.suggestedClientId && clientId === it.suggestedClientId}
            onPick={(id, lbl) => {
              setClientId(id);
              setClientLabel(lbl);
            }}
          />

          {/* To'lov maydonlari */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>
                Summa *
                {it.amountConfidence === "high" && (
                  <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    chekdan o&apos;qildi
                  </span>
                )}
                {it.amountConfidence === "low" && (
                  <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    taxminiy — tekshiring
                  </span>
                )}
                {it.amountConfidence === "none" && it.isHistorical && (
                  <span className="ml-2 rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    o&apos;qilmadi
                  </span>
                )}
              </Label>
              <MoneyInput value={amount} onValueChange={setAmount} />
            </div>
            <div>
              <Label>Valyuta</Label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {Object.entries(CURRENCY).map(([key, lbl]) => (
                  <option key={key} value={key}>
                    {key} ({lbl})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Necha kunga</Label>
              <Input
                type="number"
                min={1}
                max={366}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <div>
              <Label>To&apos;lov sanasi</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          {/* Chekda bir necha summa bo'lsa (masalan Paynet: "To'lov summasi" va
              "Mijozdan olinadigan" — komissiya tufayli har xil) operator tanlaydi */}
          {it.amountCandidates.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Chekda topilgan summalar:
              </span>
              {it.amountCandidates.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setAmount(String(c.value));
                    if (c.currency) setCurrency(c.currency);
                  }}
                  className={
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
                    (Number(amount) === c.value
                      ? "bg-primary-600 text-white"
                      : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700")
                  }
                  title={c.label ?? "yorliqsiz"}
                >
                  {c.value.toLocaleString("uz-UZ")}
                  {c.label && (
                    <span className="ml-1 opacity-70">· {c.label}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="sm:max-w-xs">
            <Label>To&apos;lov usuli</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(PAYMENT_METHOD).map(([key, lbl]) => (
                <option key={key} value={key}>
                  {lbl}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={pending} onClick={confirm}>
              {!pending && <CheckCircle2 className="h-4 w-4" />}
              {pending ? "Saqlanmoqda..." : "Tasdiqlash"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 dark:text-red-400"
              disabled={pending}
              onClick={reject}
            >
              <X className="h-3.5 w-3.5" /> Rad etish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mijozni tanlash: avtomatik topilgan bo'lsa ko'rsatadi, aks holda qidiruv. */
function ClientPicker({
  clientId,
  label,
  autoMatched,
  onPick,
}: {
  clientId: string;
  label: string;
  autoMatched: boolean;
  onPick: (id: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [searching, start] = useTransition();
  const [open, setOpen] = useState(false);

  function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    start(async () => {
      setResults(await searchClientsForReceipt(q));
    });
  }

  if (clientId && !open) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/40">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="text-emerald-800 dark:text-emerald-200">{label}</span>
        {autoMatched && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
            telefon bo&apos;yicha topildi
          </span>
        )}
        <button
          type="button"
          className="ml-auto text-xs underline text-slate-500 dark:text-slate-400"
          onClick={() => setOpen(true)}
        >
          O&apos;zgartirish
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        Mijoz avtomatik topilmadi &mdash; nomi yoki telefoni bo&apos;yicha qidiring.
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Restoran nomi, ism yoki telefon..."
          value={query}
          onChange={(e) => search(e.target.value)}
        />
      </div>
      {searching && <p className="text-xs text-slate-400">Qidirilmoqda...</p>}
      {results.length > 0 && (
        <ul className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => {
                  onPick(r.id, r.label);
                  setOpen(false);
                  setQuery("");
                  setResults([]);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

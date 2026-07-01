"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Phone,
  Bell,
  MessageSquarePlus,
  ArrowUpRight,
  History,
  LayoutList,
  Search,
  X,
  CalendarCheck,
  Check,
  Download,
} from "lucide-react";
import {
  saveLeadCell,
  setSpecialNote,
  escalateLead,
  finishDay,
} from "@/actions/leads";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LeadStageBadge } from "@/components/status-badge";
import {
  PaymentReceiptModal,
  type PayTarget,
} from "@/components/payment-receipt-modal";
import { LEAD_OUTCOME, leadOutcomeLabel, leadStageLabel } from "@/lib/constants";
import { formatMoney, formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { PhoneCopyButton } from "@/components/phone-copy";
import { buildCsv, downloadCsv } from "@/lib/csv-export";
import { confirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";

export type LeadHistory = {
  date: string; // YYYY-MM-DD
  result: string;
  note: string | null;
  operator: string | null;
};

export type LeadRow = {
  id: string;
  overdue: boolean;
  overdueDays: number;
  restaurantName: string;
  fullName: string;
  region: string | null;
  phone: string;
  monthlyAmount: number;
  currency: string;
  nextPaymentDate: string | null;
  stage: string;
  pendingStage: string | null;
  lastContactedAt: string | null;
  missedCallCount: number;
  specialNote: string | null;
  specialNoteBy: string | null;
  specialNoteAt: string | null;
  todayOutcome: string | null;
  todayNote: string | null;
  history: LeadHistory[];
};

const OUTCOME_CELL: Record<string, string> = {
  NO_ANSWER: "text-red-700 dark:text-red-300",
  PHONE_OFF: "text-red-700 dark:text-red-300",
  BUSY: "text-amber-700 dark:text-amber-300",
  CALL_LATER: "text-amber-700 dark:text-amber-300",
  WILL_PAY: "text-blue-700 dark:text-blue-300",
  WILL_PAY_TOMORROW: "text-blue-700 dark:text-blue-300",
  PAYMENT_REMINDED: "text-blue-700 dark:text-blue-300",
  FORWARDED: "text-slate-600 dark:text-slate-300",
  HAS_ISSUE: "text-amber-700 dark:text-amber-300",
  NO_PROBLEM: "text-emerald-700 dark:text-emerald-300",
  PAID: "text-emerald-700 dark:text-emerald-300",
  RESOLVED: "text-emerald-700 dark:text-emerald-300",
  REFUSED: "text-rose-600 dark:text-rose-400",
  DEACTIVATED: "text-slate-500 dark:text-slate-400",
};

const TODAY = new Date().toISOString().slice(0, 10);

type Modal =
  | { type: "specialView"; lead: LeadRow }
  | { type: "specialEdit"; lead: LeadRow }
  | { type: "history"; lead: LeadRow; day: LeadHistory }
  | { type: "fullHistory"; lead: LeadRow }
  | null;

export function LeadTable({ leads }: { leads: LeadRow[] }) {
  const [rows, setRows] = useState<LeadRow[]>(leads);
  const [mode, setMode] = useState<"joriy" | "tarix">("joriy");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<Modal>(null);
  const [specialText, setSpecialText] = useState("");
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [pending, startTransition] = useTransition();
  const [finishing, setFinishing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" tugmasi qidiruvni fokuslaydi (input/textarea ichida bo'lmasa)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.restaurantName.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        (r.region ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Tarix rejimi uchun kun ustunlari (bugundan tashqari, o'sib boruvchi)
  const dayColumns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const h of r.history) if (h.date !== TODAY) set.add(h.date);
    return [...set].sort();
  }, [rows]);

  function patchRow(id: string, patch: Partial<LeadRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function flashSaved(id: string) {
    setSaved((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 1500);
  }

  function save(row: LeadRow, outcome: string | null, note: string | null) {
    if (!outcome) return; // natija tanlanmasa saqlamaymiz
    startTransition(async () => {
      const res = await saveLeadCell(row.id, outcome, note);
      if (!res.error) {
        patchRow(row.id, {
          pendingStage: res.pendingStage ?? row.pendingStage,
          missedCallCount: res.missedCallCount ?? row.missedCallCount,
          todayOutcome: outcome,
          todayNote: note,
        });
        flashSaved(row.id);
      }
    });
  }

  async function onEscalate(row: LeadRow) {
    const ok = await confirmDialog({
      title: "Boshliqqa yo'naltirilsinmi?",
      message: `"${row.restaurantName}" lidi eskalatsiya navbatiga o'tadi.`,
      confirmLabel: "Yo'naltirish",
      variant: "primary",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await escalateLead(row.id);
      if (res.ok) setRows((prev) => prev.filter((r) => r.id !== row.id));
    });
  }

  function openSpecialEdit(lead: LeadRow) {
    setSpecialText(lead.specialNote ?? "");
    setModal({ type: "specialEdit", lead });
  }

  function saveSpecial() {
    if (!modal || modal.type !== "specialEdit") return;
    const lead = modal.lead;
    startTransition(async () => {
      const res = await setSpecialNote(lead.id, specialText);
      if (res.ok) {
        patchRow(lead.id, {
          specialNote: res.specialNote ?? null,
          specialNoteBy: res.specialNoteBy ?? null,
          specialNoteAt: res.specialNoteAt ?? null,
        });
        setModal(null);
      }
    });
  }

  function onFinishDay() {
    setFinishing(true);
    startTransition(async () => {
      await finishDay({}, new FormData());
      window.location.reload();
    });
  }

  function exportCsv() {
    const cols = [
      { key: "restoran", label: "Restoran" },
      { key: "fio", label: "FIO" },
      { key: "viloyat", label: "Viloyat" },
      { key: "telefon", label: "Telefon" },
      { key: "bolim", label: "Bo'lim" },
      { key: "oxirgi", label: "Oxirgi aloqa" },
      { key: "natija", label: "Bugungi natija" },
      { key: "izoh", label: "Izoh" },
      { key: "kotarilmagan", label: "Ko'tarilmagan" },
    ];
    const data = rows.map((r) => ({
      restoran: r.restaurantName,
      fio: r.fullName,
      viloyat: r.region ?? "",
      telefon: r.phone,
      bolim: leadStageLabel(r.pendingStage ?? r.stage),
      oxirgi: r.lastContactedAt ? formatDate(r.lastContactedAt) : "",
      natija: r.todayOutcome ? leadOutcomeLabel(r.todayOutcome) : "",
      izoh: r.todayNote ?? "",
      kotarilmagan: r.missedCallCount,
    }));
    downloadCsv(
      `kunlik-ish-${new Date().toISOString().slice(0, 10)}.csv`,
      buildCsv(cols, data),
    );
  }

  function onOutcomeChange(row: LeadRow, value: string) {
    if (value === "PAID") {
      // "To'lov qildi" — chek modalini ochamiz (saqlash modaldan keyin)
      setPayTarget({
        id: row.id,
        restaurantName: row.restaurantName,
        monthlyAmount: row.monthlyAmount,
        currency: row.currency,
      });
      return;
    }
    save(row, value || null, row.todayNote);
  }

  const OutcomeSelect = ({ row }: { row: LeadRow }) => (
    <Select
      value={row.todayOutcome ?? ""}
      onChange={(e) => onOutcomeChange(row, e.target.value)}
      className={"h-8 text-xs " + (OUTCOME_CELL[row.todayOutcome ?? ""] ?? "")}
    >
      <option value="">Tanlang…</option>
      {Object.entries(LEAD_OUTCOME).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 p-0.5">
          <button
            onClick={() => setMode("joriy")}
            className={
              "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium " +
              (mode === "joriy" ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300")
            }
          >
            <LayoutList className="h-4 w-4" /> Joriy
          </button>
          <button
            onClick={() => setMode("tarix")}
            className={
              "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium " +
              (mode === "tarix" ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300")
            }
          >
            <History className="h-4 w-4" /> Tarix
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Qidirish… ( / )"
              aria-label="Lidlarni qidirish"
              className="h-9 w-44 pl-8"
            />
          </div>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button onClick={onFinishDay} disabled={finishing || pending}>
            <CalendarCheck className="h-4 w-4" />
            {finishing ? "..." : "Kunni yakunlash"}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={query ? "Hech narsa topilmadi" : "Bugun bajariladigan lid yo'q"}
          hint={
            query
              ? "Boshqa kalit so'z bilan qidirib ko'ring."
              : "Hammasi joyida — bugungi ish yakunlangan yoki yangi lid yo'q."
          }
        />
      ) : mode === "joriy" ? (
        <JoriyTable
          rows={filtered}
          saved={saved}
          OutcomeSelect={OutcomeSelect}
          onNoteSave={(row, note) => {
            patchRow(row.id, { todayNote: note });
            save(row, row.todayOutcome, note);
          }}
          onBell={(lead) => setModal({ type: "specialView", lead })}
          onSpecial={openSpecialEdit}
          onEscalate={onEscalate}
          onHistory={(lead) => setModal({ type: "fullHistory", lead })}
        />
      ) : (
        <TarixTable
          rows={filtered}
          dayColumns={dayColumns}
          OutcomeSelect={OutcomeSelect}
          onBell={(lead) => setModal({ type: "specialView", lead })}
          onCell={(lead, day) => setModal({ type: "history", lead, day })}
        />
      )}

      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          {modal.type === "specialView" && (
            <SpecialView
              lead={modal.lead}
              onEdit={() => openSpecialEdit(modal.lead)}
            />
          )}
          {modal.type === "specialEdit" && (
            <div>
              <h3 className="mb-2 text-base font-semibold">
                Maxsus izoh — {modal.lead.restaurantName}
              </h3>
              <Textarea
                value={specialText}
                onChange={(e) => setSpecialText(e.target.value)}
                placeholder="Muhim, doimiy izoh (mijoz nomi yonida qo'ng'iroqcha bilan ko'rinadi)"
                className="min-h-[100px]"
              />
              <div className="mt-3 flex gap-2">
                <Button onClick={saveSpecial} disabled={pending} size="sm">
                  Saqlash
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setModal(null)}
                >
                  Bekor
                </Button>
              </div>
            </div>
          )}
          {modal.type === "history" && (
            <HistoryView lead={modal.lead} day={modal.day} />
          )}
          {modal.type === "fullHistory" && <FullHistoryView lead={modal.lead} />}
        </ModalOverlay>
      )}

      {payTarget && (
        <PaymentReceiptModal
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={(clientId) => {
            patchRow(clientId, { todayOutcome: "PAID", pendingStage: "RESOLVED" });
            flashSaved(clientId);
            setPayTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Joriy jadval ---------- */
function JoriyTable({
  rows,
  saved,
  OutcomeSelect,
  onNoteSave,
  onBell,
  onSpecial,
  onEscalate,
  onHistory,
}: {
  rows: LeadRow[];
  saved: Record<string, boolean>;
  OutcomeSelect: (p: { row: LeadRow }) => React.ReactElement;
  onNoteSave: (row: LeadRow, note: string) => void;
  onBell: (lead: LeadRow) => void;
  onSpecial: (lead: LeadRow) => void;
  onEscalate: (lead: LeadRow) => void;
  onHistory: (lead: LeadRow) => void;
}) {
  return (
    <>
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:block">
      <table className="w-full min-w-[1000px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="px-3 py-2.5 font-medium">Restoran / FIO</th>
            <th className="px-3 py-2.5 font-medium">Viloyat</th>
            <th className="px-3 py-2.5 font-medium">Telefon</th>
            <th className="px-3 py-2.5 text-center font-medium">K.</th>
            <th className="px-3 py-2.5 font-medium">Bo'lim</th>
            <th className="px-3 py-2.5 font-medium">Oxirgi aloqa</th>
            <th className="px-3 py-2.5 font-medium">To'lov</th>
            <th className="bg-blue-50/60 dark:bg-blue-950/40 px-3 py-2.5 font-medium text-blue-700 dark:text-blue-300">
              Bugun
            </th>
            <th className="bg-blue-50/60 dark:bg-blue-950/40 px-3 py-2.5 font-medium text-blue-700 dark:text-blue-300">
              Izoh
            </th>
            <th className="px-3 py-2.5 text-center font-medium">Amallar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={
                "border-b border-slate-100 dark:border-slate-800 last:border-0 " +
                (r.missedCallCount >= 3
                  ? "bg-red-50/40 dark:bg-red-950/40"
                  : r.overdue
                    ? "bg-amber-50/50 dark:bg-amber-950/40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800")
              }
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {r.restaurantName}
                  </span>
                  {r.specialNote && (
                    <button
                      title="Maxsus izoh"
                      aria-label="Maxsus izohni ko'rish"
                      onClick={() => onBell(r)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                    >
                      <Bell className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{r.fullName}</div>
              </td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.region ?? "—"}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <a
                    href={`tel:${normalizePhone(r.phone)}`}
                    className="text-blue-600 dark:text-blue-400"
                  >
                    {formatPhone(r.phone)}
                  </a>
                  <PhoneCopyButton phone={r.phone} />
                </span>
              </td>
              <td
                className={
                  "px-3 py-2 text-center " +
                  (r.missedCallCount >= 3
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "text-slate-500 dark:text-slate-400")
                }
              >
                {r.missedCallCount}
              </td>
              <td className="px-3 py-2">
                <LeadStageBadge stage={r.pendingStage ?? r.stage} />
              </td>
              <td className="px-3 py-2">
                {r.history.length === 0 ? (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onHistory(r)}
                    title={r.history[0].note || "Izoh yo'q"}
                    className="text-left hover:underline"
                  >
                    <div className="text-slate-600 dark:text-slate-300">{formatDate(r.history[0].date)}</div>
                    <div className={"text-xs " + (OUTCOME_CELL[r.history[0].result] ?? "text-slate-500 dark:text-slate-400")}>
                      {leadOutcomeLabel(r.history[0].result)}
                      {r.history[0].note ? " 💬" : ""}
                    </div>
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                {formatMoney(r.monthlyAmount, r.currency)}
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {r.nextPaymentDate ? formatDate(r.nextPaymentDate) : "—"}
                </div>
                {r.overdue && (
                  <span className="mt-0.5 inline-flex items-center rounded-full bg-red-100 dark:bg-red-950 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                    Qarzdor ({r.overdueDays} kun)
                  </span>
                )}
              </td>
              <td className="bg-blue-50/40 dark:bg-blue-950/40 px-2 py-2">
                <OutcomeSelect row={r} />
              </td>
              <td className="bg-blue-50/40 dark:bg-blue-950/40 px-2 py-2">
                <Input
                  defaultValue={r.todayNote ?? ""}
                  onBlur={(e) => onNoteSave(r, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur(); // Enter → saqlash
                  }}
                  placeholder="izoh…"
                  className="h-8 text-xs"
                />
                {saved[r.id] && (
                  <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-300">
                    <Check className="h-3 w-3" /> saqlandi
                  </span>
                )}
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-col items-stretch gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onSpecial(r)}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" /> Maxsus
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-amber-300 text-xs text-amber-700 dark:text-amber-300"
                    onClick={() => onEscalate(r)}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" /> Boshliqqa
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobil kartalar */}
    <div className="space-y-2 md:hidden">
      {rows.map((r) => (
        <div
          key={r.id}
          className={
            "rounded-xl border bg-white dark:bg-slate-900 p-3 " +
            (r.missedCallCount >= 3
              ? "border-red-200 bg-red-50/40 dark:bg-red-950/40"
              : r.overdue
                ? "border-amber-200 bg-amber-50/40 dark:bg-amber-950/40"
                : "border-slate-200 dark:border-slate-800")
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-900 dark:text-slate-100">{r.restaurantName}</span>
                {r.specialNote && (
                  <button
                    title="Maxsus izoh"
                    onClick={() => onBell(r)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                  >
                    <Bell className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{r.fullName}</div>
            </div>
            <LeadStageBadge stage={r.pendingStage ?? r.stage} />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1">
              <a
                href={`tel:${normalizePhone(r.phone)}`}
                className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400"
              >
                <Phone className="h-4 w-4" /> {formatPhone(r.phone)}
              </a>
              <PhoneCopyButton phone={r.phone} />
            </span>
            <span className="text-slate-600 dark:text-slate-300">{formatMoney(r.monthlyAmount, r.currency)}</span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{r.region ?? "—"}</span>
            {r.history.length > 0 ? (
              <button
                type="button"
                onClick={() => onHistory(r)}
                className="underline-offset-2 hover:underline"
              >
                Oxirgi: {formatDate(r.history[0].date)} · {leadOutcomeLabel(r.history[0].result)}
                {r.history[0].note ? " 💬" : ""}
              </button>
            ) : (
              <span>Oxirgi: —</span>
            )}
            {r.missedCallCount >= 3 && (
              <span className="font-medium text-red-600 dark:text-red-400">
                Ko'tarilmagan: {r.missedCallCount}
              </span>
            )}
            {r.overdue && (
              <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-950 px-1.5 py-0.5 font-semibold text-red-700 dark:text-red-300">
                Qarzdor ({r.overdueDays} kun)
              </span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <OutcomeSelect row={r} />
            <Input
              defaultValue={r.todayNote ?? ""}
              onBlur={(e) => onNoteSave(r, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur(); // Enter → saqlash
              }}
              placeholder="izoh…"
              className="h-8 text-xs"
            />
          </div>
          {saved[r.id] && (
            <div className="mt-1 inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-300">
              <Check className="h-3 w-3" /> saqlandi
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 text-xs"
              onClick={() => onSpecial(r)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Maxsus
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 border-amber-300 text-xs text-amber-700 dark:text-amber-300"
              onClick={() => onEscalate(r)}
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Boshliqqa
            </Button>
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

/* ---------- Tarix jadval ---------- */
function TarixTable({
  rows,
  dayColumns,
  OutcomeSelect,
  onBell,
  onCell,
}: {
  rows: LeadRow[];
  dayColumns: string[];
  OutcomeSelect: (p: { row: LeadRow }) => React.ReactElement;
  onBell: (lead: LeadRow) => void;
  onCell: (lead: LeadRow, day: LeadHistory) => void;
}) {
  const dayLabel = (d: string) => d.slice(8) + "." + d.slice(5, 7);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-left text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
              Restoran / FIO
            </th>
            {dayColumns.map((d) => (
              <th
                key={d}
                className="min-w-[88px] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2 py-2.5 text-center text-xs font-medium text-slate-400 dark:text-slate-500"
              >
                {dayLabel(d)}
              </th>
            ))}
            <th className="sticky right-0 z-10 min-w-[150px] border-b border-l border-slate-200 dark:border-slate-800 bg-blue-50 dark:bg-blue-950/40 px-2 py-2.5 text-left text-xs font-medium text-blue-700 dark:text-blue-300">
              Bugun
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const byDate = new Map(r.history.map((h) => [h.date, h]));
            return (
              <tr key={r.id}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {r.restaurantName}
                    </span>
                    {r.specialNote && (
                      <button
                        title="Maxsus izoh"
                        onClick={() => onBell(r)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                      >
                        <Bell className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{r.fullName}</div>
                </td>
                {dayColumns.map((d) => {
                  const h = byDate.get(d);
                  return (
                    <td
                      key={d}
                      onClick={() => h && onCell(r, h)}
                      className={
                        "border-b border-slate-100 dark:border-slate-800 px-2 py-2 text-center text-xs " +
                        (h
                          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 " +
                            (OUTCOME_CELL[h.result] ?? "text-slate-600 dark:text-slate-300")
                          : "text-slate-300")
                      }
                    >
                      {h ? leadOutcomeLabel(h.result) : "—"}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 border-b border-l border-slate-100 dark:border-slate-800 bg-blue-50/40 dark:bg-blue-950/40 px-2 py-2">
                  <OutcomeSelect row={r} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Modal ---------- */
function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex justify-end">
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SpecialView({ lead, onEdit }: { lead: LeadRow; onEdit: () => void }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-amber-700 dark:text-amber-300">
        <Bell className="h-4 w-4" /> Maxsus izoh — {lead.restaurantName}
      </h3>
      <p className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900">
        {lead.specialNote}
      </p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {lead.specialNoteBy ?? "—"}
        {lead.specialNoteAt ? ` · ${formatDate(lead.specialNoteAt)}` : ""}
      </p>
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Tahrirlash / o'chirish
        </Button>
      </div>
    </div>
  );
}

function HistoryView({ lead, day }: { lead: LeadRow; day: LeadHistory }) {
  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">
        {formatDate(day.date)} — {leadOutcomeLabel(day.result)}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">{lead.restaurantName}</p>
      <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
        {day.note ? (
          <span className="text-slate-700 dark:text-slate-200">{day.note}</span>
        ) : (
          <span className="italic text-slate-400 dark:text-slate-500">Izoh mavjud emas</span>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Xodim: {day.operator ?? "—"}
      </p>
    </div>
  );
}

/* Mijozning to'liq aloqa tarixi — oldingi kunlarni izohlari bilan scroll qilib ko'rish */
function FullHistoryView({ lead }: { lead: LeadRow }) {
  return (
    <div>
      <h3 className="mb-0.5 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
        <History className="h-4 w-4 text-slate-500 dark:text-slate-400" /> Aloqa tarixi
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {lead.restaurantName} · {lead.fullName} · {lead.history.length} ta yozuv
      </p>
      <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {lead.history.length === 0 && (
          <p className="py-6 text-center text-sm italic text-slate-400 dark:text-slate-500">
            Hali aloqa yozuvi yo'q
          </p>
        )}
        {lead.history.map((h) => (
          <div
            key={h.date}
            className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={
                  "text-sm font-medium " +
                  (OUTCOME_CELL[h.result] ?? "text-slate-700 dark:text-slate-200")
                }
              >
                {leadOutcomeLabel(h.result)}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(h.date)}</span>
            </div>
            {h.note ? (
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{h.note}</p>
            ) : (
              <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">Izoh yo'q</p>
            )}
            {h.operator && (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Xodim: {h.operator}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

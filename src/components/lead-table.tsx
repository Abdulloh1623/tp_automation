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
  Ban,
  Lightbulb,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  saveLeadCell,
  revertLeadCell,
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
import {
  LEAD_OUTCOME,
  leadOutcomeLabel,
  leadSegmentLabel,
  leadStageLabel,
  type LeadSegment,
} from "@/lib/constants";
import { formatMoney, formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { tzDayKey } from "@/lib/tz";
import { PhoneCopyButton } from "@/components/phone-copy";
import { buildCsv, downloadCsv } from "@/lib/csv-export";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { EmptyState } from "@/components/empty-state";

export type LeadHistory = {
  date: string; // YYYY-MM-DD
  result: string;
  note: string | null;
  operator: string | null;
};

export type LeadRow = {
  id: string;
  /** Kunlik fokus segmenti — "nega bu lid menda" savoliga javob. */
  segment: LeadSegment;
  /** Majburiy: bugunga va'da berilgan yoki eski qarzdor (fokusdan qat'i nazar). */
  mustCall: boolean;
  /** Bugun "to'lov qiladi" deyilgan, chek hali kelmagan — bugun qayta tekshiring. */
  awaitingReceipt: boolean;
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
  WILL_PAY: "text-primary-700 dark:text-primary-300",
  WILL_PAY_TOMORROW: "text-primary-700 dark:text-primary-300",
  PAYMENT_REMINDED: "text-primary-700 dark:text-primary-300",
  FORWARDED: "text-slate-600 dark:text-slate-300",
  HAS_ISSUE: "text-amber-700 dark:text-amber-300",
  NO_PROBLEM: "text-emerald-700 dark:text-emerald-300",
  SUGGESTION: "text-primary-700 dark:text-primary-300",
  PAID: "text-emerald-700 dark:text-emerald-300",
  RESOLVED: "text-emerald-700 dark:text-emerald-300",
  REFUSED: "text-rose-600 dark:text-rose-400",
  DEACTIVATED: "text-slate-500 dark:text-slate-400",
};

// Restoran nomi bo'sh (to'ldirilmagan) mijozlar uchun bosiladigan yorliq
function leadName(r: LeadRow): string {
  return r.restaurantName.trim() || "(nomsiz)";
}

const SEGMENT_TONE: Record<LeadSegment, string> = {
  DEBTOR_OLD: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  DEBTOR: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  DUE_SOON: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  AWAITING_PAYMENT: "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300",
  NEW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  NO_ANSWER_2X: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  FOLLOW_UP: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  HIGH_VALUE: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  SILENT: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  OTHERS: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

/** "Nega bu lid bugun menda" — kunlik fokus segmenti va majburiy belgisi. */
function SegmentTags({ row }: { row: LeadRow }) {
  return (
    <>
      {row.mustCall && (
        <span
          title="Bugunga qayta-aloqa va'da qilingan yoki eski qarzdor — fokusdan qat'i nazar aloqaga chiqiladi"
          className="inline-flex shrink-0 items-center rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
        >
          Majburiy
        </span>
      )}
      {row.awaitingReceipt && (
        <span
          title="Mijoz bugun to'lov qilaman dedi — chek hali kelmadi. Kun yakunlanganda chek bo'lmasa, ertangi kunga suriladi."
          className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
        >
          Chek kutilmoqda
        </span>
      )}
      {row.segment !== "OTHERS" && (
        <span
          title="Kunlik fokus segmenti"
          className={
            "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
            SEGMENT_TONE[row.segment]
          }
        >
          {leadSegmentLabel(row.segment)}
        </span>
      )}
    </>
  );
}

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
  // Otkaz (REFUSED) tanlanganda izohni majburiy so'rovchi modal
  const [refuseTarget, setRefuseTarget] = useState<LeadRow | null>(null);
  const [refuseReason, setRefuseReason] = useState("");
  // Taklif (SUGGESTION) tanlanganda taklif matnini so'rovchi modal
  const [suggestTarget, setSuggestTarget] = useState<LeadRow | null>(null);
  const [suggestText, setSuggestText] = useState("");
  // Muammo bor (HAS_ISSUE) tanlanganda tavsifni majburiy so'rovchi modal
  const [issueTarget, setIssueTarget] = useState<LeadRow | null>(null);
  const [issueText, setIssueText] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
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
    const today = tzDayKey(new Date());
    const set = new Set<string>();
    for (const r of rows) for (const h of r.history) if (h.date !== today) set.add(h.date);
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
      } else {
        toast(res.error, "error");
      }
    });
  }

  // Otkaz modalidan tasdiqlash — izoh (sabab) majburiy.
  function confirmRefuse() {
    if (!refuseTarget) return;
    const reason = refuseReason.trim();
    if (!reason) return;
    const row = refuseTarget;
    patchRow(row.id, { todayNote: reason });
    save(row, "REFUSED", reason);
    setRefuseTarget(null);
    setRefuseReason("");
  }

  // Taklif modalidan tasdiqlash — taklif matni majburiy.
  function confirmSuggestion() {
    if (!suggestTarget) return;
    const text = suggestText.trim();
    if (!text) return;
    const row = suggestTarget;
    patchRow(row.id, { todayNote: text });
    save(row, "SUGGESTION", text);
    setSuggestTarget(null);
    setSuggestText("");
  }

  // Muammo modalidan tasdiqlash — tavsif majburiy.
  function confirmIssue() {
    if (!issueTarget) return;
    const text = issueText.trim();
    if (!text) return;
    const row = issueTarget;
    patchRow(row.id, { todayNote: text });
    save(row, "HAS_ISSUE", text);
    setIssueTarget(null);
    setIssueText("");
  }

  // Bugungi natijani qaytarish (undo) — xato yoki sinov uchun tanlangan bo'lsa.
  async function revertCell(row: LeadRow) {
    if (!row.todayOutcome) return;
    const ok = await confirmDialog({
      title: "Bugungi natijani qaytarish",
      message: `"${row.restaurantName || "(nomsiz)"}" — bugungi "${leadOutcomeLabel(
        row.todayOutcome,
      )}" natijasi bekor qilinadi.`,
      confirmLabel: "Qaytarish",
      variant: "primary",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await revertLeadCell(row.id);
      if (res.ok) {
        patchRow(row.id, {
          todayOutcome: null,
          todayNote: null,
          pendingStage: null,
          missedCallCount: res.missedCallCount ?? 0,
          history: row.history.filter((h) => h.date !== tzDayKey(new Date())),
        });
        toast("Bugungi natija qaytarildi", "success");
      } else {
        toast(res.error ?? "Xatolik", "error");
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

  // Mijoz nomiga bosilganda — to'liq profil (intercepting @modal orqali katta
  // blur-modalda ochiladi, navbat sahifasi ostida qoladi).
  function openClientInfo(row: LeadRow) {
    router.push(`/mijozlar/${row.id}`);
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
    if (value === "REFUSED") {
      // "Otkaz" — izoh (sabab) majburiy, avval modal ochamiz
      setRefuseReason(row.todayNote ?? "");
      setRefuseTarget(row);
      return;
    }
    if (value === "SUGGESTION") {
      // "Taklif" — matn majburiy (Takliflar bo'limiga tushadi), modal ochamiz
      setSuggestText(row.todayNote ?? "");
      setSuggestTarget(row);
      return;
    }
    if (value === "HAS_ISSUE") {
      // "Muammo bor" — tavsif majburiy (tasodifiy muammo ochilishining oldini oladi)
      setIssueText(row.todayNote ?? "");
      setIssueTarget(row);
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
              (mode === "joriy" ? "bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300" : "text-slate-600 dark:text-slate-300")
            }
          >
            <LayoutList className="h-4 w-4" /> Joriy
          </button>
          <button
            onClick={() => setMode("tarix")}
            className={
              "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium " +
              (mode === "tarix" ? "bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300" : "text-slate-600 dark:text-slate-300")
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
          // Qidiruv natijasiz bo'lganda mijoz qo'shish taklif qilinadi;
          // navbat bo'sh bo'lganda esa bu taklif o'rinsiz.
          actionHref={query ? "/mijozlar/yangi" : undefined}
          actionLabel={query ? "Yangi mijoz qo'shish" : undefined}
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
          onRevert={revertCell}
          onBell={(lead) => setModal({ type: "specialView", lead })}
          onInfo={openClientInfo}
          onSpecial={openSpecialEdit}
          onEscalate={onEscalate}
          onHistory={(lead) => setModal({ type: "fullHistory", lead })}
        />
      ) : (
        <TarixTable
          rows={filtered}
          dayColumns={dayColumns}
          OutcomeSelect={OutcomeSelect}
          onRevert={revertCell}
          onBell={(lead) => setModal({ type: "specialView", lead })}
          onInfo={openClientInfo}
          onCell={(lead, day) => setModal({ type: "history", lead, day })}
        />
      )}

      {modal && (
        <ModalOverlay onClose={() => setModal(null)} size="md">
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

      {refuseTarget && (
        <ModalOverlay onClose={() => setRefuseTarget(null)}>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-rose-700 dark:text-rose-300">
              <Ban className="h-4 w-4" /> Otkaz — {refuseTarget.restaurantName}
            </h3>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Mijoz xizmatdan voz kechgan deb belgilanadi. Sabab (izoh) majburiy.
            </p>
            <Textarea
              value={refuseReason}
              onChange={(e) => setRefuseReason(e.target.value)}
              placeholder="masalan: narx qimmat, boshqa tizimga o'tdi…"
              className="min-h-[90px]"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={confirmRefuse}
                disabled={pending || !refuseReason.trim()}
              >
                <Ban className="h-4 w-4" /> Otkaz qilish
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRefuseTarget(null)}
                disabled={pending}
              >
                Bekor
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {suggestTarget && (
        <ModalOverlay onClose={() => setSuggestTarget(null)}>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-primary-700 dark:text-primary-300">
              <Lightbulb className="h-4 w-4" /> Taklif — {suggestTarget.restaurantName}
            </h3>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Mijozda muammo yo'q — dastur yoki jarayon yuzasidan taklif. Admin/menejer
              &ldquo;Takliflar&rdquo; bo'limiga tushadi.
            </p>
            <Textarea
              value={suggestText}
              onChange={(e) => setSuggestText(e.target.value)}
              placeholder="masalan: hisobot bo'limiga eksport tugmasi qo'shilsa…"
              className="min-h-[90px]"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={confirmSuggestion}
                disabled={pending || !suggestText.trim()}
              >
                <Lightbulb className="h-4 w-4" /> Taklifni saqlash
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSuggestTarget(null)}
                disabled={pending}
              >
                Bekor
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {issueTarget && (
        <ModalOverlay onClose={() => setIssueTarget(null)}>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" /> Muammo — {issueTarget.restaurantName}
            </h3>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Muammo tavsifini yozing — u &ldquo;Muammolar&rdquo; bo'limiga tushadi.
              Tasodifan tanlagan bo'lsangiz, boshqa natijani tanlang.
            </p>
            <Textarea
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
              placeholder="masalan: kassa apparati ishlamayapti, chek chiqmayapti…"
              className="min-h-[90px]"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={confirmIssue}
                disabled={pending || !issueText.trim()}
              >
                <AlertTriangle className="h-4 w-4" /> Muammoni saqlash
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIssueTarget(null)}
                disabled={pending}
              >
                Bekor
              </Button>
            </div>
          </div>
        </ModalOverlay>
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
  onRevert,
  onBell,
  onInfo,
  onSpecial,
  onEscalate,
  onHistory,
}: {
  rows: LeadRow[];
  saved: Record<string, boolean>;
  OutcomeSelect: (p: { row: LeadRow }) => React.ReactElement;
  onNoteSave: (row: LeadRow, note: string) => void;
  onRevert: (lead: LeadRow) => void;
  onBell: (lead: LeadRow) => void;
  onInfo: (lead: LeadRow) => void;
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
            <th className="bg-primary-50/60 dark:bg-primary-950/40 px-3 py-2.5 font-medium text-primary-700 dark:text-primary-300">
              Bugun
            </th>
            <th className="bg-primary-50/60 dark:bg-primary-950/40 px-3 py-2.5 font-medium text-primary-700 dark:text-primary-300">
              Izoh
            </th>
            <th className="px-3 py-2.5 text-center font-medium">Amallar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
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
                  <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-slate-100 px-1 text-xs font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    title="Mijoz profilini ochish"
                    onClick={() => onInfo(r)}
                    className="text-left font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 hover:underline underline-offset-2"
                  >
                    {leadName(r)}
                  </button>
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
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <SegmentTags row={r} />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{r.fullName}</div>
              </td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.region ?? "—"}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <a
                    href={`tel:${normalizePhone(r.phone)}`}
                    className="text-primary-600 dark:text-primary-400"
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
              <td className="bg-primary-50/40 dark:bg-primary-950/40 px-2 py-2">
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <OutcomeSelect row={r} />
                  </div>
                  {r.todayOutcome && (
                    <button
                      type="button"
                      onClick={() => onRevert(r)}
                      title="Bugungi natijani qaytarish"
                      aria-label="Bugungi natijani qaytarish"
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
              <td className="bg-primary-50/40 dark:bg-primary-950/40 px-2 py-2">
                <Input
                  key={`note-${r.id}-${r.todayOutcome ?? "none"}`}
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
      {rows.map((r, i) => (
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
                <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-slate-100 px-1 text-xs font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {i + 1}
                </span>
                <button
                  type="button"
                  title="Mijoz profilini ochish"
                  onClick={() => onInfo(r)}
                  className="text-left font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 hover:underline underline-offset-2"
                >
                  {leadName(r)}
                </button>
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
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <SegmentTags row={r} />
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{r.fullName}</div>
            </div>
            <LeadStageBadge stage={r.pendingStage ?? r.stage} />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1">
              <a
                href={`tel:${normalizePhone(r.phone)}`}
                className="inline-flex items-center gap-1 font-medium text-primary-600 dark:text-primary-400"
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
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <OutcomeSelect row={r} />
              </div>
              {r.todayOutcome && (
                <button
                  type="button"
                  onClick={() => onRevert(r)}
                  title="Bugungi natijani qaytarish"
                  aria-label="Bugungi natijani qaytarish"
                  className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
            <Input
              key={`mnote-${r.id}-${r.todayOutcome ?? "none"}`}
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
  onRevert,
  onBell,
  onInfo,
  onCell,
}: {
  rows: LeadRow[];
  dayColumns: string[];
  OutcomeSelect: (p: { row: LeadRow }) => React.ReactElement;
  onRevert: (lead: LeadRow) => void;
  onBell: (lead: LeadRow) => void;
  onInfo: (lead: LeadRow) => void;
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
            <th className="sticky right-0 z-10 min-w-[150px] border-b border-l border-slate-200 dark:border-slate-800 bg-primary-50 dark:bg-primary-950/40 px-2 py-2.5 text-left text-xs font-medium text-primary-700 dark:text-primary-300">
              Bugun
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const byDate = new Map(r.history.map((h) => [h.date, h]));
            return (
              <tr key={r.id}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-slate-100 px-1 text-xs font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      title="Mijoz profilini ochish"
                      onClick={() => onInfo(r)}
                      className="text-left font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 hover:underline underline-offset-2"
                    >
                      {leadName(r)}
                    </button>
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
                <td className="sticky right-0 z-10 border-b border-l border-slate-100 dark:border-slate-800 bg-primary-50/40 dark:bg-primary-950/40 px-2 py-2">
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <OutcomeSelect row={r} />
                    </div>
                    {r.todayOutcome && (
                      <button
                        type="button"
                        onClick={() => onRevert(r)}
                        title="Bugungi natijani qaytarish"
                        aria-label="Bugungi natijani qaytarish"
                        className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
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
  blur = false,
  size = "md",
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** Orqadagi oynani xiralashtiradi (mijoz profili uchun). */
  blur?: boolean;
  /** Panel kengligi: "sm" — kichikroq ko'rinish. */
  size?: "sm" | "md";
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        blur ? "bg-black/25 backdrop-blur-md" : "bg-black/40"
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full ${
          size === "sm" ? "max-w-sm" : "max-w-md"
        } rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg`}
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

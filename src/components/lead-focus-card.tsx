"use client";

import { useState, useTransition } from "react";
import { Target, Shuffle, Check, Plus, X } from "lucide-react";
import { redistributeLeads, setLeadFocus } from "@/actions/distribution";
import {
  LEAD_PRIORITY_PROFILES,
  CUSTOM_FOCUS_SEGMENTS,
  leadSegmentLabel,
  focusLabel,
  focusHint,
  focusSharesText,
  type LeadFocusSelection,
  type LeadProfileId,
  type LeadSegment as LeadSegmentType,
} from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/toaster";
import { useRouter } from "next/navigation";

const PROFILE_IDS = Object.keys(LEAD_PRIORITY_PROFILES) as LeadProfileId[];

type CustomRow = { segment: LeadSegmentType; share: number };

function initialCustomRows(sel: LeadFocusSelection): CustomRow[] {
  return sel.kind === "custom" ? sel.shares.map((s) => ({ ...s })) : [];
}

export function LeadFocusCard({
  selection,
  todayOnly,
  canEdit,
}: {
  selection: LeadFocusSelection;
  todayOnly: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"preset" | "custom">(selection.kind);
  const [presetId, setPresetId] = useState<LeadProfileId>(
    selection.kind === "preset" ? selection.id : "BALANCED",
  );
  const [customRows, setCustomRows] = useState<CustomRow[]>(initialCustomRows(selection));
  const [onlyToday, setOnlyToday] = useState(true);
  const [pending, start] = useTransition();

  const customSum = customRows.reduce((s, r) => s + r.share, 0);
  const customLeftover = Math.max(0, 100 - customSum);
  const availableSegments = CUSTOM_FOCUS_SEGMENTS.filter(
    (seg) => !customRows.some((r) => r.segment === seg),
  );

  function addRow(seg: LeadSegmentType) {
    setCustomRows((rows) => [...rows, { segment: seg, share: Math.min(10, customLeftover) || 5 }]);
  }
  function removeRow(seg: LeadSegmentType) {
    setCustomRows((rows) => rows.filter((r) => r.segment !== seg));
  }
  function setShare(seg: LeadSegmentType, share: number) {
    setCustomRows((rows) =>
      rows.map((r) => (r.segment === seg ? { ...r, share: Math.max(1, Math.min(100, share)) } : r)),
    );
  }

  function save() {
    start(async () => {
      const res =
        choice === "preset"
          ? await setLeadFocus({ kind: "preset", id: presetId }, onlyToday)
          : await setLeadFocus({ kind: "custom", shares: customRows }, onlyToday);
      if (!res.ok) {
        toast(res.error ?? "Xatolik", "error");
        return;
      }
      const label =
        choice === "preset" ? LEAD_PRIORITY_PROFILES[presetId].label : "Maxsus";
      toast(`Fokus: ${label}` + (onlyToday ? " (faqat bugunga)" : ""), "success");
      setOpen(false);
      router.refresh();
    });
  }

  function redistribute() {
    start(async () => {
      const res = await redistributeLeads();
      if (res.ok) {
        toast(
          `${res.assigned} lid taqsimlandi` +
            (res.kept ? ` · ${res.kept} tasi egasida qoldi` : ""),
          "success",
        );
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  const canSaveCustom = customRows.length > 0 && customSum <= 100;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Bugungi fokus
            </span>
            {todayOnly && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                faqat bugunga
              </span>
            )}
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
            {focusLabel(selection)}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">{focusHint(selection)}</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {focusSharesText(selection)}
          </div>
        </div>

        {canEdit && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Target className="h-4 w-4" />
              {open ? "Yopish" : "O'zgartirish"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={redistribute}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Shuffle className="h-4 w-4" />
              {pending ? "Taqsimlanmoqda..." : "Qayta taqsimla"}
            </button>
          </div>
        )}
      </div>

      {canEdit && open && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setChoice("preset")}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
                (choice === "preset"
                  ? "bg-primary-600 text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              Tayyor profil
            </button>
            <button
              type="button"
              onClick={() => setChoice("custom")}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
                (choice === "custom"
                  ? "bg-primary-600 text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              Maxsus (o'zim tanlayman)
            </button>
          </div>

          {choice === "preset" ? (
            <div className="mt-3 space-y-2">
              {PROFILE_IDS.map((id) => (
                <label
                  key={id}
                  className={
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
                    (presetId === id
                      ? "border-primary-300 bg-primary-50/60 dark:border-primary-800 dark:bg-primary-950/40"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800")
                  }
                >
                  <input
                    type="radio"
                    name="lead-focus"
                    className="mt-1"
                    checked={presetId === id}
                    onChange={() => setPresetId(id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                      {LEAD_PRIORITY_PROFILES[id].label}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {LEAD_PRIORITY_PROFILES[id].hint}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                      {focusSharesText({ kind: "preset", id })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mezonlarni tanlang va har biriga kunlik ro'yxatning necha foizini
                egallashini belgilang. Qolgan ulush avtomatik "Boshqalar"ga tushadi
                — joy hech qachon bo'sh qolmaydi.
              </p>

              {customRows.length > 0 && (
                <div className="space-y-2">
                  {customRows.map((row) => (
                    <div key={row.segment} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                        {leadSegmentLabel(row.segment)}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={row.share}
                        onChange={(e) => setShare(row.segment, Number(e.target.value) || 1)}
                        className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm dark:border-slate-800 dark:bg-slate-900"
                      />
                      <span className="text-xs text-slate-400">%</span>
                      <button
                        type="button"
                        onClick={() => removeRow(row.segment)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                        aria-label={`${leadSegmentLabel(row.segment)}ni olib tashlash`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {availableSegments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableSegments.map((seg) => (
                    <button
                      key={seg}
                      type="button"
                      onClick={() => addRow(seg)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-primary-300 hover:text-primary-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-primary-700"
                    >
                      <Plus className="h-3 w-3" />
                      {leadSegmentLabel(seg)}
                    </button>
                  ))}
                </div>
              )}

              <div
                className={
                  "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium " +
                  (customSum > 100
                    ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    : "bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300")
                }
              >
                <span>
                  Tanlanganlar: {customSum}% · Boshqalar: {customLeftover}%
                </span>
                {customSum > 100 && <span>Jami 100% dan oshmasin</span>}
              </div>
            </div>
          )}

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={onlyToday}
              onChange={(e) => setOnlyToday(e.target.checked)}
            />
            Faqat bugunga (ertaga doimiy tanlov qaytadi)
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={pending || (choice === "custom" && !canSaveCustom)}
              onClick={save}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {pending ? "Saqlanmoqda..." : "Saqlash"}
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Keyingi taqsimotdan kuchga kiradi — bugun ishlangan lidlar egasida qoladi.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

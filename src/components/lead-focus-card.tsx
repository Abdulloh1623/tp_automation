"use client";

import { useState, useTransition } from "react";
import { Target, Shuffle, Check } from "lucide-react";
import { redistributeLeads, setLeadFocus } from "@/actions/distribution";
import {
  LEAD_PRIORITY_PROFILES,
  leadSegmentLabel,
  type LeadProfileId,
} from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/toaster";
import { useRouter } from "next/navigation";

const PROFILE_IDS = Object.keys(LEAD_PRIORITY_PROFILES) as LeadProfileId[];

/** Profil ulushlarini qisqa matnga aylantiradi: "Qarzdor 40% · Yangi 15% · …" */
function sharesText(id: LeadProfileId): string {
  return LEAD_PRIORITY_PROFILES[id].shares
    .map((s) => `${leadSegmentLabel(s.segment)} ${s.share}%`)
    .join(" · ");
}

export function LeadFocusCard({
  profile,
  todayOnly,
  canEdit,
}: {
  profile: LeadProfileId;
  todayOnly: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<LeadProfileId>(profile);
  const [onlyToday, setOnlyToday] = useState(true);
  const [pending, start] = useTransition();

  const current = LEAD_PRIORITY_PROFILES[profile];

  function save() {
    start(async () => {
      const res = await setLeadFocus(choice, onlyToday);
      if (!res.ok) {
        toast(res.error ?? "Xatolik", "error");
        return;
      }
      toast(
        `Fokus: ${LEAD_PRIORITY_PROFILES[choice].label}` + (onlyToday ? " (faqat bugunga)" : ""),
        "success",
      );
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
            {current.label}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">{current.hint}</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sharesText(profile)}</div>
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
          <div className="space-y-2">
            {PROFILE_IDS.map((id) => (
              <label
                key={id}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
                  (choice === id
                    ? "border-primary-300 bg-primary-50/60 dark:border-primary-800 dark:bg-primary-950/40"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800")
                }
              >
                <input
                  type="radio"
                  name="lead-focus"
                  className="mt-1"
                  checked={choice === id}
                  onChange={() => setChoice(id)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                    {LEAD_PRIORITY_PROFILES[id].label}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {LEAD_PRIORITY_PROFILES[id].hint}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                    {sharesText(id)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={onlyToday}
              onChange={(e) => setOnlyToday(e.target.checked)}
            />
            Faqat bugunga (ertaga doimiy profil qaytadi)
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
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

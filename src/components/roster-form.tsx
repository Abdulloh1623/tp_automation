"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { setDutyRoster, type RosterEntryInput } from "@/actions/roster";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { USER_SHIFT, type UserShift } from "@/lib/constants";

export type RosterRow = { id: string; name: string; onDuty: boolean; shift: UserShift };

type Nav = { prevKey: string; nextKey: string; todayKey: string; tomorrowKey: string; label: string };

/**
 * Kunlik ish jadvali — ADMIN har bir operator uchun "bugun ishlaydimi" va
 * qaysi smenada ekanini belgilaydi. Saqlash `DutyDay` jadvalini o'sha kun
 * uchun TO'LIQ almashtiradi; kunlik taqsimot (cron 08:00/18:00) shundan
 * o'qiydi.
 */
export function RosterForm({
  dateKey,
  nav,
  initialRows,
}: {
  dateKey: string;
  nav: Nav;
  initialRows: RosterRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(initialRows);

  const planned = rows.some((r) => r.onDuty);
  const dayCount = rows.filter((r) => r.onDuty && r.shift === "DAY").length;
  const nightCount = rows.filter((r) => r.onDuty && r.shift === "NIGHT").length;

  function toggle(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, onDuty: !r.onDuty } : r)));
  }
  function setShift(id: string, shift: UserShift) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, shift } : r)));
  }
  function setAll(onDuty: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, onDuty })));
  }
  function goto(key: string) {
    router.push(`/ish-jadvali?date=${key}`);
  }

  function onSave() {
    start(async () => {
      const entries: RosterEntryInput[] = rows
        .filter((r) => r.onDuty)
        .map((r) => ({ userId: r.id, shift: r.shift }));
      const res = await setDutyRoster(dateKey, entries);
      if (res.ok) {
        toast(
          entries.length ? `Jadval saqlandi — ${entries.length} xodim` : "Jadval bo'shatildi",
          "success",
        );
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => goto(nav.prevKey)} aria-label="Oldingi kun">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-[8rem] items-center justify-center gap-1.5 px-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            <CalendarClock className="h-4 w-4 text-slate-400" /> {nav.label}
          </div>
          <Button variant="ghost" size="icon" onClick={() => goto(nav.nextKey)} aria-label="Keyingi kun">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={dateKey === nav.todayKey ? "secondary" : "outline"}
            size="sm"
            onClick={() => goto(nav.todayKey)}
          >
            Bugun
          </Button>
          <Button
            variant={dateKey === nav.tomorrowKey ? "secondary" : "outline"}
            size="sm"
            onClick={() => goto(nav.tomorrowKey)}
          >
            Ertaga
          </Button>
        </div>
      </Card>

      {!planned && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          Bu kun uchun jadval hali belgilanmagan — kunlik taqsimot bu kuni hech
          kimga ishlamaydi. Xodimlarni belgilab, saqlang.
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {planned ? `${dayCount} kunduzgi · ${nightCount} kechki` : "Hech kim belgilanmagan"}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAll(true)}>
              Hammasi ishlaydi
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAll(false)}>
              Hammasi bo'sh
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <th className="px-4 py-3 font-medium">Ishlaydi</th>
                <th className="px-4 py-3 font-medium">Xodim</th>
                <th className="px-4 py-3 font-medium">Smena</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    "border-b border-slate-100 last:border-0 dark:border-slate-800 " +
                    (r.onDuty ? "" : "opacity-50")
                  }
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`${r.name} bugun ishlaydi`}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600"
                      checked={r.onDuty}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                    {r.name}
                  </td>
                  <td className="px-4 py-2.5">
                    <Select
                      aria-label={`${r.name} smenasi`}
                      className="h-8 w-44 text-xs"
                      value={r.shift}
                      disabled={!r.onDuty}
                      onChange={(e) => setShift(r.id, e.target.value as UserShift)}
                    >
                      {Object.entries(USER_SHIFT).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    Faol operator yo'q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} loading={pending} disabled={pending}>
          <Save className="h-4 w-4" /> Jadvalni saqlash
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, AlertCircle } from "lucide-react";
import { editCallLog, deleteCallLog } from "@/actions/calllogs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { CALL_RESULT, callResultLabel } from "@/lib/constants";

export type EditableCallLog = {
  id: string;
  result: string;
  note: string | null;
  nextFollowUpDate: string | null; // ISO yoki null
};

// ISO sanani <input type="date"> uchun yyyy-MM-dd ga (lokal vaqt).
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Izoh (qo'ng'iroq yozuvi) uchun tahrir/o'chirish tugmalari. Ruxsatlar serverda
 * ham qayta tekshiriladi — bular faqat UI ko'rsatkichi.
 * - `canEdit` — tahrirlash (natija + matn + sana);
 * - `canDelete` — o'chirish (operator uchun 5 soatlik oynada, admin doim).
 */
export function CallLogActions({
  log,
  canEdit,
  canDelete,
}: {
  log: EditableCallLog;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState(log.result);
  const [note, setNote] = useState(log.note ?? "");
  const [nextDate, setNextDate] = useState(isoToDateInput(log.nextFollowUpDate));

  if (!canEdit && !canDelete) return null;

  // Natija CALL_RESULT ro'yxatida bo'lmasa (masalan tizim yozuvi) — joriy qiymatni
  // ham variant sifatida ko'rsatamiz, aks holda select uni yo'qotib qo'yardi.
  const resultOptions = Object.hasOwn(CALL_RESULT, result)
    ? Object.entries(CALL_RESULT)
    : [[result, callResultLabel(result)] as [string, string], ...Object.entries(CALL_RESULT)];

  function saveEdit() {
    setError(null);
    const fd = new FormData();
    fd.set("result", result);
    if (note.trim()) fd.set("note", note.trim());
    if (nextDate) fd.set("nextFollowUpDate", nextDate);
    start(async () => {
      const res = await editCallLog(log.id, fd);
      if (res.ok) {
        setEditing(false);
        toast("Izoh tahrirlandi", "success");
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: "Izoh o'chirilsinmi?",
      message: "Bu qo'ng'iroq yozuvi o'chiriladi. Amal audit jurnalida saqlanadi.",
      confirmLabel: "O'chirish",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteCallLog(log.id);
      if (res.ok) {
        toast("Izoh o'chirildi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Tahrirlash"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="O'chirish"
            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:hover:bg-red-950 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Izohni tahrirlash
              </h3>
              <button
                onClick={() => setEditing(false)}
                aria-label="Yopish"
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Natija</Label>
                  <Select value={result} onChange={(e) => setResult(e.target.value)}>
                    {resultOptions.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Keyingi qo&apos;ng&apos;iroq sanasi</Label>
                  <Input
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Izoh</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Suhbat natijasi, kelishuv..."
                  className="min-h-[60px]"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={saveEdit} loading={pending}>
                Saqlash
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Bekor
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Bell, X, AlertCircle } from "lucide-react";
import { setSpecialNote } from "@/actions/leads";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

/**
 * Mijozning maxsus (doimiy) eslatmasi — nom yonidagi qo'ng'iroqcha. Barcha
 * bo'limlarda qayta ishlatiladi: eslatma bo'lsa to'ldirilgan amber qo'ng'iroqcha
 * ko'rinadi, bosilsa ko'rish/tahrirlash oynasi ochiladi. Eslatma yo'q bo'lsa —
 * tahrir huquqi bor xodimga och qo'ng'iroqcha (qo'shish uchun), aks holda
 * umuman ko'rinmaydi. Saqlash `setSpecialNote` orqali (har qanday STAFF).
 */
export function SpecialNoteBell({
  clientId,
  restaurantName,
  note: initialNote = null,
  noteBy: initialBy = null,
  noteAt: initialAt = null,
  canEdit = true,
}: {
  clientId: string;
  restaurantName: string;
  note?: string | null;
  noteBy?: string | null;
  noteAt?: string | null;
  canEdit?: boolean;
}) {
  const [note, setNote] = useState(initialNote);
  const [by, setBy] = useState(initialBy);
  const [at, setAt] = useState(initialAt);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const has = !!note && note.trim() !== "";
  if (!has && !canEdit) return null;

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setErr(null);
    setEditing(!has);
    setText(note ?? "");
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setEditing(false);
  }
  function save() {
    setErr(null);
    start(async () => {
      const res = await setSpecialNote(clientId, text);
      if (res.ok) {
        setNote(res.specialNote ?? null);
        setBy(res.specialNoteBy ?? null);
        setAt(res.specialNoteAt ?? null);
        toast(
          res.specialNote && res.specialNote.trim() !== ""
            ? "Eslatma saqlandi"
            : "Eslatma o'chirildi",
          "success",
        );
        close();
      } else {
        setErr(res.error ?? "Xatolik");
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={has ? (note ?? "") : "Eslatma qo'shish"}
        aria-label={has ? "Maxsus eslatma" : "Eslatma qo'shish"}
        className={
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition " +
          (has
            ? "bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300"
            : "text-slate-300 hover:text-amber-500 dark:text-slate-600 dark:hover:text-amber-400")
        }
      >
        <Bell className={"h-3.5 w-3.5" + (has ? " fill-current" : "")} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-amber-700 dark:text-amber-300">
                <Bell className="h-4 w-4" /> Maxsus eslatma — {restaurantName}
              </h3>
              <button
                type="button"
                onClick={close}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {err && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {err}
              </div>
            )}

            {!editing && has ? (
              <>
                <p className="whitespace-pre-wrap rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-200">
                  {note}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {by ?? "—"}
                  {at ? ` · ${formatDate(at)}` : ""}
                </p>
                {canEdit && (
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      Tahrirlash / o'chirish
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Muhim, doimiy eslatma (mijoz nomi yonida qo'ng'iroqcha bilan barcha bo'limlarda ko'rinadi)"
                  className="min-h-[100px]"
                />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={save} disabled={pending}>
                    {pending ? "Saqlanmoqda..." : "Saqlash"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={close} disabled={pending}>
                    Bekor
                  </Button>
                  <span className="ml-auto self-center text-xs text-slate-400 dark:text-slate-500">
                    Bo'sh saqlansa — eslatma o'chadi
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

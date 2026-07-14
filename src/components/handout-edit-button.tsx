"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, AlertCircle, Check, X } from "lucide-react";
import { updateHandoutMovement, deleteHandoutMovement } from "@/actions/inventory";
import { HANDOUT_MODE, type HandoutMode } from "@/lib/constants";

type Opt = { id: string; name: string };

/**
 * Ustaga taqsimot yozuvi uchun to'liq CRUD boshqaruvi: "Tahrirlash" (usta,
 * texnika, miqdor, izoh) va "O'chirish" (to'liq rollback) — ikkalasi ham
 * tasdiq bilan. Server ombor va usta qoldig'ini muvozanatlaydi.
 */
export function HandoutEditButton({
  movementId,
  quantity,
  note,
  documentStatus,
  toId,
  equipmentTypeId,
  ustalar,
  types,
}: {
  movementId: string;
  quantity: number;
  note: string | null;
  documentStatus: string | null;
  toId: string | null;
  equipmentTypeId: string;
  ustalar: Opt[];
  types: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false); // tahrirni tasdiqlash bosqichi
  const [delOpen, setDelOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // "01" bug'iga qarshi: miqdor STRING sifatida saqlanadi, boshidagi nollar
  // tozalanadi (bo'sh qiymatga ruxsat — foydalanuvchi yozayotganda).
  const [qty, setQty] = useState(String(quantity));
  const [nt, setNt] = useState(note ?? "");
  const [usta, setUsta] = useState(toId ?? ustalar[0]?.id ?? "");
  const [eq, setEq] = useState(equipmentTypeId);
  const [mode, setMode] = useState<HandoutMode>(
    documentStatus === "NOT_REQUIRED" ? "WITHOUT_DOC" : "WITH_DOC",
  );

  const qtyNum = parseInt(qty, 10);
  const qtyInvalid = !Number.isFinite(qtyNum) || qtyNum <= 0;
  const noteMissing = mode === "WITHOUT_DOC" && !nt.trim();

  // Boshidagi nolni olib tashlaydi ("01" -> "1"), bo'sh qiymatni saqlaydi.
  function onQtyChange(v: string) {
    const cleaned = v.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    setQty(cleaned);
    setConfirm(false);
  }

  function openEdit() {
    setQty(String(quantity));
    setNt(note ?? "");
    setUsta(toId ?? ustalar[0]?.id ?? "");
    setEq(equipmentTypeId);
    setMode(documentStatus === "NOT_REQUIRED" ? "WITHOUT_DOC" : "WITH_DOC");
    setConfirm(false);
    setErr(null);
    setOpen(true);
  }

  function save() {
    setErr(null);
    start(async () => {
      const res = await updateHandoutMovement(movementId, {
        toId: usta,
        equipmentTypeId: eq,
        quantity: qtyNum,
        note: nt,
        handoutMode: mode,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
        setConfirm(false);
      }
    });
  }

  function remove() {
    setErr(null);
    start(async () => {
      const res = await deleteHandoutMovement(movementId);
      if (res.ok) {
        setDelOpen(false);
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={openEdit}
          className="inline-flex items-center gap-1 rounded-lg border border-primary-300 dark:border-primary-800 px-2 py-0.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40"
        >
          <Pencil className="h-3.5 w-3.5" /> Tahrirlash
        </button>
        <button
          type="button"
          onClick={() => { setErr(null); setDelOpen(true); }}
          className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-800 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-3.5 w-3.5" /> O'chirish
        </button>
      </div>

      {/* Tahrirlash modali */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Taqsimotni tahrirlash</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Usta</label>
                <select value={usta} onChange={(e) => { setUsta(e.target.value); setConfirm(false); }}
                  className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm">
                  {ustalar.length === 0 && <option value="">Usta yo'q</option>}
                  {ustalar.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Texnika</label>
                <select value={eq} onChange={(e) => { setEq(e.target.value); setConfirm(false); }}
                  className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm">
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Miqdor</label>
                <input type="number" min={1} inputMode="numeric" value={qty}
                  onChange={(e) => onQtyChange(e.target.value)}
                  className={"h-9 w-full rounded-lg border bg-white dark:bg-slate-900 px-2 text-sm " + (qtyInvalid ? "border-red-400 dark:border-red-600" : "border-slate-300 dark:border-slate-700")} />
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Hozirgi: {quantity} dona. O'zgartirish ombor/usta qoldig'ini muvozanatlaydi.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Topshirish usuli</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(HANDOUT_MODE) as HandoutMode[]).map((mm) => (
                    <button key={mm} type="button" onClick={() => { setMode(mm); setConfirm(false); }}
                      className={
                        "rounded-lg border px-2 py-1.5 text-xs font-medium " +
                        (mode === mm
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300"
                          : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")
                      }>
                      {HANDOUT_MODE[mm]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                  Izoh {mode === "WITHOUT_DOC" && <span className="text-red-600 dark:text-red-400">*</span>}
                </label>
                <input value={nt}
                  onChange={(e) => { setNt(e.target.value); setConfirm(false); }}
                  placeholder={mode === "WITHOUT_DOC" ? "majburiy" : "ixtiyoriy"}
                  className={"h-9 w-full rounded-lg border bg-white dark:bg-slate-900 px-2 text-sm " + (noteMissing ? "border-red-400 dark:border-red-600" : "border-slate-300 dark:border-slate-700")} />
              </div>
            </div>

            {err && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {err}
              </div>
            )}
            {confirm && !err && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> Qoldiq muvozanati o'zgaradi. Davom etilsinmi?
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {!confirm ? (
                <button type="button" disabled={pending || qtyInvalid || noteMissing || !usta || !eq}
                  onClick={() => setConfirm(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  <Check className="h-4 w-4" /> Saqlash
                </button>
              ) : (
                <button type="button" disabled={pending || qtyInvalid || noteMissing || !usta || !eq}
                  onClick={save}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  <Check className="h-4 w-4" /> Ha, saqlash
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                Bekor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* O'chirish tasdig'i modali */}
      {delOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDelOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
              </span>
              <h3 className="text-base font-semibold">Taqsimotni o'chirish</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ushbu taqsimotni butunlay o'chirish va texnikalarni omborga
              qaytarishni xohlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.
            </p>

            {err && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {err}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button type="button" disabled={pending} onClick={remove}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> Ha, o'chirish
              </button>
              <button type="button" onClick={() => setDelOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                Bekor
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

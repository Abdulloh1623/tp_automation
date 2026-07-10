"use client";

// Tablo/monitoring uchun: operator kunlik limit indikatori + inline tahrir (qalam)
// + limit to'lganda "Qo'shimcha biriktirish" (limitni chetlab o'tish) tanlagichi.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Check, X, Loader2 } from "lucide-react";
import { updateUserDailyLimit } from "@/actions/users";
import { assignExtraClient, listAssignableClients } from "@/actions/clients";
import { toast } from "@/components/toaster";

type AssignableClient = { id: string; restaurantName: string; fullName: string };

export function OperatorLimitControls({
  operatorId,
  operatorName,
  assigned,
  dailyLimit,
  canManage,
}: {
  operatorId: string;
  operatorName: string;
  assigned: number;
  dailyLimit: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Limit tahriri
  const [editing, setEditing] = useState(false);
  const [limitVal, setLimitVal] = useState(String(dailyLimit));

  // Qo'shimcha biriktirish tanlagichi
  const [picker, setPicker] = useState(false);
  const [clients, setClients] = useState<AssignableClient[] | null>(null);
  const [pick, setPick] = useState("");

  const overLimit = assigned >= dailyLimit;
  const pct = dailyLimit > 0 ? Math.min(100, Math.round((assigned / dailyLimit) * 100)) : 0;
  const barColor = overLimit ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400";

  function saveLimit() {
    const n = Number(limitVal);
    if (!Number.isInteger(n) || n < 0) {
      toast("Limit musbat butun son bo'lishi kerak", "error");
      return;
    }
    start(async () => {
      const res = await updateUserDailyLimit(operatorId, n);
      if (res.ok) {
        toast(`${operatorName}: limit ${n} ga o'zgartirildi`, "success");
        setEditing(false);
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  function openPicker() {
    setPicker(true);
    if (clients === null) {
      start(async () => {
        const list = await listAssignableClients();
        setClients(list);
      });
    }
  }

  function assignExtra() {
    if (!pick) return;
    start(async () => {
      const res = await assignExtraClient(operatorId, pick);
      if (res.ok) {
        toast(`Qo'shimcha mijoz ${operatorName}ga biriktirildi`, "success");
        setPicker(false);
        setPick("");
        setClients(null); // ro'yxat eskirdi — keyingi ochilishda qayta yuklanadi
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Limit indikatori + qalam */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={"h-full rounded-full transition-all duration-500 " + barColor}
              style={{ width: `${pct}%` }}
            />
          </div>
          {editing ? (
            <span className="inline-flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={limitVal}
                onChange={(e) => setLimitVal(e.target.value)}
                className="h-7 w-16 rounded-md border border-white/20 bg-slate-800 px-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={saveLimit}
                disabled={pending}
                className="rounded-md p-1 text-emerald-300 hover:bg-white/10 disabled:opacity-50"
                aria-label="Saqlash"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setLimitVal(String(dailyLimit));
                }}
                className="rounded-md p-1 text-slate-300 hover:bg-white/10"
                aria-label="Bekor qilish"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
              <span className={overLimit ? "font-semibold text-red-300" : "text-slate-300"}>
                {assigned} / {dailyLimit} limit
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                  aria-label="Limitni tahrirlash"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Limit to'lganda — qo'shimcha biriktirish (limitni chetlab o'tish) */}
      {canManage && overLimit && !picker && (
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/25"
        >
          <Plus className="h-3.5 w-3.5" /> Qo'shimcha biriktirish
        </button>
      )}

      {canManage && picker && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={pending || clients === null}
            className="h-8 min-w-0 flex-1 rounded-md border border-white/20 bg-slate-800 px-2 text-sm text-white"
          >
            <option value="">
              {clients === null
                ? "Yuklanmoqda…"
                : clients.length === 0
                  ? "Biriktirilmagan mijoz yo'q"
                  : "Mijoz tanlang…"}
            </option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.restaurantName} — {c.fullName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={assignExtra}
            disabled={pending || !pick}
            className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Biriktirish
          </button>
          <button
            type="button"
            onClick={() => {
              setPicker(false);
              setPick("");
            }}
            className="rounded-md p-1.5 text-slate-300 hover:bg-white/10"
            aria-label="Yopish"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

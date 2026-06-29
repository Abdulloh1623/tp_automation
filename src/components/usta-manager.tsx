"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Power, Trash2, X, AlertCircle } from "lucide-react";
import { createUsta, updateUsta, setUstaActive, deleteUsta } from "@/actions/ustalar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RegionMultiSelect } from "@/components/region-multi-select";
import { confirmDialog } from "@/components/confirm-dialog";
import { parseRegions } from "@/lib/constants";

export type ManagedUsta = {
  id: string;
  name: string;
  region: string | null;
  regions: string | null;
  phone: string | null;
  isActive: boolean;
};

type Mode = { kind: "create" } | { kind: "edit"; usta: ManagedUsta } | null;

export function UstaManager({ ustalar }: { ustalar: ManagedUsta[] }) {
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function openCreate() {
    setName(""); setRegions([]); setPhone(""); setError(null);
    setMode({ kind: "create" });
  }
  function openEdit(u: ManagedUsta) {
    setName(u.name); setRegions(parseRegions(u.regions, u.region)); setPhone(u.phone ?? "");
    setError(null);
    setMode({ kind: "edit", usta: u });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, close = true) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (close) setMode(null);
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  function submit() {
    if (!mode) return;
    if (mode.kind === "create") act(() => createUsta({ name, regions, phone }));
    else act(() => updateUsta(mode.usta.id, { name, regions, phone }));
  }

  return (
    <div className="space-y-4">
      {!mode && error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ustalar tizimga kirmaydi — boshliq biriktiradi va telefon orqali aloqa qiladi.
        </p>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4" /> Yangi usta
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3 font-medium">Ism</th>
              <th className="px-4 py-3 font-medium">Viloyat</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 text-center font-medium">Holat</th>
              <th className="px-4 py-3 text-right font-medium">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {ustalar.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                  Usta yo'q
                </td>
              </tr>
            )}
            {ustalar.map((u) => (
              <tr
                key={u.id}
                className={"border-b border-slate-100 dark:border-slate-800 last:border-0 " + (u.isActive ? "" : "opacity-50")}
              >
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{u.name}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {parseRegions(u.regions, u.region).join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.phone ?? "—"}</td>
                <td className="px-4 py-3 text-center">
                  {u.isActive ? <Badge tone="green">Faol</Badge> : <Badge tone="slate">Nofaol</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(u)}>
                      <Pencil className="h-3.5 w-3.5" /> Tahrir
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className={"h-7 px-2 text-xs " + (u.isActive ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}
                      disabled={pending}
                      onClick={() => act(() => setUstaActive(u.id, !u.isActive), false)}
                    >
                      <Power className="h-3.5 w-3.5" /> {u.isActive ? "Faolsiz" : "Yoqish"}
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600 dark:text-red-400"
                      disabled={pending}
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: "Ustani o'chirish",
                          message: `"${u.name}" ro'yxatdan o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.`,
                          confirmLabel: "O'chirish",
                        });
                        if (ok) act(() => deleteUsta(u.id), false);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> O'chir
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMode(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {mode.kind === "create" ? "Yangi usta" : "Ustani tahrirlash"}
              </h3>
              <button onClick={() => setMode(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <Label>Ism</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 ..." />
              </div>
              <div>
                <Label>Viloyatlar (bir nechta tanlash mumkin)</Label>
                <RegionMultiSelect value={regions} onChange={setRegions} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={submit} disabled={pending}>{pending ? "Saqlanmoqda..." : "Saqlash"}</Button>
              <Button variant="ghost" onClick={() => setMode(null)}>Bekor</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

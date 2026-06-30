"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, CheckCircle2 } from "lucide-react";
import { quickCompleteClient } from "@/actions/clients";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { REGIONS } from "@/lib/constants";

export type IncompleteRow = {
  id: string;
  fullName: string;
  restaurantName: string;
  phone: string;
  region: string | null;
  contractNumber: string | null;
};

function RowEditor({ c, onSaved }: { c: IncompleteRow; onSaved: () => void }) {
  // "—" — import paytidagi joy egasi; tahrirda bo'sh ko'rsatamiz (to'ldirishga undash).
  const baseRest = c.restaurantName === "—" ? "" : c.restaurantName;
  const [restaurantName, setRestaurantName] = useState(baseRest);
  const [phone, setPhone] = useState(c.phone);
  const [region, setRegion] = useState(c.region ?? "");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const dirty =
    restaurantName !== baseRest ||
    phone !== c.phone ||
    region !== (c.region ?? "");

  function save() {
    startTransition(async () => {
      const res = await quickCompleteClient(c.id, { restaurantName, phone, region });
      if (res.ok) {
        setDone(true);
        toast("Saqlandi", "success");
        // Har doim yangilash: to'liq bo'lsa qator ro'yxatdan chiqadi, aks holda
        // server qiymatlari bilan moslashadi ("saqlandi" belgisi to'g'ri ko'rinadi).
        setTimeout(onSaved, 400);
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <>
      {/* Desktop qator */}
      <tr className="hidden border-b border-slate-100 dark:border-slate-800 last:border-0 md:table-row">
        <td className="px-3 py-2.5">
          <div className="font-medium text-slate-900 dark:text-slate-100">{c.fullName || "—"}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500">{c.contractNumber || "—"}</div>
        </td>
        <td className="px-3 py-2.5">
          <Input
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="Restoran nomi…"
            className={"h-9 " + (!restaurantName.trim() ? "border-red-300 dark:border-red-800" : "")}
          />
        </td>
        <td className="px-3 py-2.5">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998…"
            className={"h-9 " + (!phone.trim() ? "border-red-300 dark:border-red-800" : "")}
          />
        </td>
        <td className="px-3 py-2.5">
          <Select value={region} onChange={(e) => setRegion(e.target.value)} className="h-9">
            <option value="">—</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-2">
            {done && !dirty && (
              <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600">
                <Check className="h-3.5 w-3.5" /> saqlandi
              </span>
            )}
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              {pending ? "..." : "Saqlash"}
            </Button>
            <Link
              href={`/mijozlar/${c.id}/tahrir`}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </div>
        </td>
      </tr>

      {/* Mobil karta */}
      <tr className="md:hidden">
        <td colSpan={5} className="px-0 py-1.5">
          <Card className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900 dark:text-slate-100">{c.fullName || "—"}</div>
              {done && !dirty && (
                <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600">
                  <Check className="h-3.5 w-3.5" /> saqlandi
                </span>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Restoran nomi</label>
              <Input
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                placeholder="Restoran nomi…"
                className={"h-9 " + (!restaurantName.trim() ? "border-red-300 dark:border-red-800" : "")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Telefon</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998…"
                className={"h-9 " + (!phone.trim() ? "border-red-300 dark:border-red-800" : "")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Viloyat</label>
              <Select value={region} onChange={(e) => setRegion(e.target.value)} className="h-9">
                <option value="">—</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </div>
            <Button size="sm" onClick={save} disabled={pending || !dirty} className="w-full">
              {pending ? "..." : "Saqlash"}
            </Button>
          </Card>
        </td>
      </tr>
    </>
  );
}

export function IncompleteTable({ clients }: { clients: IncompleteRow[] }) {
  const router = useRouter();
  const onSaved = () => router.refresh();

  if (clients.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Barcha mijozlar ma'lumoti to'liq — to'ldirilmagan mijoz yo'q.
        </p>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto md:rounded-xl md:border md:border-slate-200 dark:md:border-slate-800 md:bg-white dark:md:bg-slate-900">
      <table className="w-full text-sm">
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="px-3 py-3 font-medium">Mijoz / FIO</th>
            <th className="px-3 py-3 font-medium">Restoran nomi</th>
            <th className="px-3 py-3 font-medium">Telefon</th>
            <th className="px-3 py-3 font-medium">Viloyat</th>
            <th className="px-3 py-3 text-right font-medium">Amal</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <RowEditor key={c.id} c={c} onSaved={onSaved} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

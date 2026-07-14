"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Operator = { id: string; name: string };

export function ClientsFilter({
  regions,
  statuses,
  operators,
}: {
  regions: readonly string[];
  statuses: [string, string][];
  operators: Operator[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const notFoundOnly = params.get("biznex") === "not_found";

  // Qidiruvni debounce bilan URL'ga yozish (yozayotganda avtomatik).
  // URL bilan solishtiramiz — mount'da yoki tashqi yangilanishda navigatsiya qilmaymiz
  // (Strict Mode'ning ikki marta chaqirishiga ham bardoshli).
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (q.trim()) sp.set("q", q.trim());
      else sp.delete("q");
      sp.set("page", "1");
      router.push(`${pathname}?${sp.toString()}`);
    }, 350);
    return () => clearTimeout(t);
  }, [q, params, router, pathname]);

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.set("page", "1");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="client-search" className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Qidiruv</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="client-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="FIO, restoran, telefon, shartnoma..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-44">
          <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Viloyat</label>
          <Select
            defaultValue={params.get("region") ?? ""}
            onChange={(e) => setParam("region", e.target.value)}
          >
            <option value="">Barchasi</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Holat</label>
          <Select
            defaultValue={params.get("status") ?? ""}
            onChange={(e) => setParam("status", e.target.value)}
          >
            <option value="">Barchasi</option>
            {statuses.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
        </div>
        {operators.length > 0 && (
          <div className="w-48">
            <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Operator</label>
            <Select
              defaultValue={params.get("assigned") ?? ""}
              onChange={(e) => setParam("assigned", e.target.value)}
            >
              <option value="">Barchasi</option>
              <option value="__none__">Biriktirilmagan</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Biznex</label>
          <button
            type="button"
            aria-pressed={notFoundOnly}
            onClick={() => setParam("biznex", notFoundOnly ? "" : "not_found")}
            className={
              "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors " +
              (notFoundOnly
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
            }
          >
            <AlertTriangle className="h-4 w-4" />
            Biznex-da topilmaganlar
          </button>
        </div>
      </div>
    </Card>
  );
}

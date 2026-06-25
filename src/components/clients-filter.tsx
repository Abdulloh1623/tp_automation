"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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
          <label className="mb-1.5 block text-xs font-medium text-slate-500">Qidiruv</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="FIO, restoran, telefon, shartnoma..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-44">
          <label className="mb-1.5 block text-xs font-medium text-slate-500">Viloyat</label>
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
          <label className="mb-1.5 block text-xs font-medium text-slate-500">Holat</label>
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
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Operator</label>
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
      </div>
    </Card>
  );
}

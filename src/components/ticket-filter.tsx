"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";

type Opt = { id: string; name: string };

/**
 * Muammolar filtri — tanlov o'zgarishi bilan AVTOMAT qo'llanadi (alohida
 * "Filtrlash" tugmasi yo'q). `router.replace` bilan SOFT navigatsiya: joriy
 * bo'lim (Yangi/Biriktirilgan/Hal tab'i) va scroll saqlanadi, sahifa qayta
 * yuklanmaydi. Lokal holat darhol tanlovni ko'rsatadi; server javobidan keyin
 * prop'lar bilan sinxronlanadi (tozalash/tashqi navigatsiya uchun).
 */
export function TicketFilter({
  type,
  priority,
  assignee,
  types,
  priorities,
  xodimlar,
  ustalar,
  canAssign,
}: {
  type: string;
  priority: string;
  assignee: string;
  types: [string, string][];
  priorities: [string, string][];
  xodimlar: Opt[];
  ustalar: Opt[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [t, setT] = useState(type);
  const [p, setP] = useState(priority);
  const [a, setA] = useState(assignee);

  // Server yangi searchParams bilan qayta render qilganda lokal holatni tekislaymiz.
  useEffect(() => {
    setT(type);
    setP(priority);
    setA(assignee);
  }, [type, priority, assignee]);

  function apply(next: { t: string; p: string; a: string }) {
    setT(next.t);
    setP(next.p);
    setA(next.a);
    const params = new URLSearchParams();
    if (next.t) params.set("type", next.t);
    if (next.p) params.set("priority", next.p);
    if (next.a) params.set("assignee", next.a);
    const qs = params.toString();
    start(() =>
      router.replace(qs ? `/muammolar?${qs}` : "/muammolar", { scroll: false }),
    );
  }

  const hasFilter = !!(t || p || a);
  const labelCls =
    "mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400";

  return (
    <div
      className={
        "flex flex-wrap items-end gap-3 transition-opacity " +
        (pending ? "opacity-60" : "")
      }
    >
      <div className="w-40">
        <label className={labelCls}>Turi</label>
        <Select value={t} onChange={(e) => apply({ t: e.target.value, p, a })}>
          <option value="">Barchasi</option>
          {types.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-40">
        <label className={labelCls}>Ustuvorlik</label>
        <Select value={p} onChange={(e) => apply({ t, p: e.target.value, a })}>
          <option value="">Barchasi</option>
          {priorities.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {canAssign && (
        <div className="w-52">
          <label className={labelCls}>Mas'ul (xodim/usta)</label>
          <Select value={a} onChange={(e) => apply({ t, p, a: e.target.value })}>
            <option value="">Barchasi</option>
            <optgroup label="Xodimlar">
              {xodimlar.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Ustalar">
              {ustalar.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
      )}

      {pending && (
        <Loader2 className="mb-2.5 h-4 w-4 animate-spin text-slate-400" aria-label="Yuklanmoqda" />
      )}
      {hasFilter && !pending && (
        <button
          type="button"
          onClick={() => apply({ t: "", p: "", a: "" })}
          className="mb-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Tozalash
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Opt = { id: string; name: string };

type Filters = {
  t: string;
  p: string;
  a: string;
  usta: string;
  rt: string;
  from: string;
  to: string;
  q: string;
};

/**
 * Muammolar filtri — tanlov o'zgarishi bilan AVTOMAT qo'llanadi (alohida
 * "Filtrlash" tugmasi yo'q). `router.replace` bilan SOFT navigatsiya: joriy
 * bo'lim (Yangi/Biriktirilgan/Hal tab'i) va scroll saqlanadi, sahifa qayta
 * yuklanmaydi. Lokal holat darhol tanlovni ko'rsatadi; server javobidan keyin
 * prop'lar bilan sinxronlanadi (tozalash/tashqi navigatsiya uchun). Qidiruv
 * matni 350ms debounce bilan (har harfda navigatsiya qilmasin uchun) —
 * qolgan (select/sana) maydonlar darhol qo'llanadi.
 */
export function TicketFilter({
  bolim,
  type,
  priority,
  assignee,
  usta,
  resolveType,
  from,
  to,
  q,
  types,
  priorities,
  xodimlar,
  ustalar,
  canAssign,
  hideType,
}: {
  /** Joriy sub-bo'lim ("muammo" bo'lmasa `?bolim=` navigatsiyada saqlanadi). */
  bolim?: string;
  type: string;
  priority: string;
  assignee: string;
  usta: string;
  resolveType: string;
  from: string;
  to: string;
  q: string;
  types: [string, string][];
  priorities: [string, string][];
  xodimlar: Opt[];
  ustalar: Opt[];
  canAssign: boolean;
  /** Turi shu bo'lim uchun qulflangan bo'lsa (masalan "Yangi versiya") — filtri ko'rsatilmaydi. */
  hideType?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Filters>({ t: type, p: priority, a: assignee, usta, rt: resolveType, from, to, q });

  // Server yangi searchParams bilan qayta render qilganda lokal holatni tekislaymiz.
  useEffect(() => {
    setF({ t: type, p: priority, a: assignee, usta, rt: resolveType, from, to, q });
  }, [type, priority, assignee, usta, resolveType, from, to, q]);

  function navigate(next: Filters) {
    const params = new URLSearchParams();
    if (bolim && bolim !== "muammo") params.set("bolim", bolim);
    if (next.t) params.set("type", next.t);
    if (next.p) params.set("priority", next.p);
    if (next.a) params.set("assignee", next.a);
    if (next.usta) params.set("usta", next.usta);
    if (next.rt) params.set("resolveType", next.rt);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.q) params.set("q", next.q);
    const qs = params.toString();
    start(() =>
      router.replace(qs ? `/muammolar?${qs}` : "/muammolar", { scroll: false }),
    );
  }

  // Qidiruv matni uchun kutilayotgan debounce — boshqa maydon shu oraliqda
  // o'zgarsa, eskirgan (stale) qidiruv holatini qaytarib yubormasligi uchun
  // BEKOR qilinadi (pastdagi `apply` va `onQueryChange`ga qarang).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Select/sana maydonlari — darhol qo'llanadi.
  function apply(patch: Partial<Filters>) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const next = { ...f, ...patch };
    setF(next);
    navigate(next);
  }

  // Qidiruv matni — debounce (yozayotganda har harfda navigatsiya qilmasin).
  // Kutilayotgan timer HAR DOIM shu chaqiruvdagi (eng yangi) `next`ni yopadi,
  // shu bois orada boshqa filtr o'zgarsa (yuqoridagi `apply`) eski timer
  // bekor qilingani uchun uni qayta yozib yubormaydi.
  function onQueryChange(value: string) {
    const next = { ...f, q: value };
    setF(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      navigate(next);
    }, 350);
  }

  const hasFilter = !!(f.t || f.p || f.a || f.usta || f.rt || f.from || f.to || f.q);
  const labelCls =
    "mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400";

  return (
    <div
      className={
        "flex flex-wrap items-end gap-3 transition-opacity " +
        (pending ? "opacity-60" : "")
      }
    >
      <div className="min-w-[200px] flex-1">
        <label className={labelCls}>Qidiruv</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={f.q}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Restoran, mijoz, telefon..."
            className="pl-9"
          />
        </div>
      </div>

      {!hideType && (
        <div className="w-40">
          <label className={labelCls}>Turi</label>
          <Select value={f.t} onChange={(e) => apply({ t: e.target.value })}>
            <option value="">Barchasi</option>
            {types.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="w-40">
        <label className={labelCls}>Ustuvorlik</label>
        <Select value={f.p} onChange={(e) => apply({ p: e.target.value })}>
          <option value="">Barchasi</option>
          {priorities.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-52">
        <label className={labelCls}>Hal qilish turi</label>
        <Select value={f.rt} onChange={(e) => apply({ rt: e.target.value })}>
          <option value="">Barchasi</option>
          <option value="USTA">Usta (joyida)</option>
          <option value="XODIM">Xodim (online)</option>
        </Select>
      </div>

      <div className="w-52">
        <label className={labelCls}>Usta</label>
        <Select value={f.usta} onChange={(e) => apply({ usta: e.target.value })}>
          <option value="">Barchasi</option>
          {ustalar.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </div>

      {canAssign && (
        <div className="w-52">
          <label className={labelCls}>Mas'ul xodim</label>
          <Select value={f.a} onChange={(e) => apply({ a: e.target.value })}>
            <option value="">Barchasi</option>
            {xodimlar.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="w-36">
        <label className={labelCls}>Ochilgan (dan)</label>
        <Input type="date" value={f.from} onChange={(e) => apply({ from: e.target.value })} />
      </div>
      <div className="w-36">
        <label className={labelCls}>Ochilgan (gacha)</label>
        <Input type="date" value={f.to} onChange={(e) => apply({ to: e.target.value })} />
      </div>

      {pending && (
        <Loader2 className="mb-2.5 h-4 w-4 animate-spin text-slate-400" aria-label="Yuklanmoqda" />
      )}
      {hasFilter && !pending && (
        <button
          type="button"
          onClick={() => apply({ t: "", p: "", a: "", usta: "", rt: "", from: "", to: "", q: "" })}
          className="mb-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Tozalash
        </button>
      )}
    </div>
  );
}

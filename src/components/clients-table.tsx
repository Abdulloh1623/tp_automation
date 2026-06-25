"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronUp, ChevronDown, ChevronsUpDown, Phone, UserCheck, X } from "lucide-react";
import { bulkAssignOperator } from "@/actions/clients";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ClientStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney, formatPhone, normalizePhone } from "@/lib/utils";

export type ClientRow = {
  id: string;
  restaurantName: string;
  fullName: string;
  region: string | null;
  phone: string;
  status: string;
  nextPaymentDate: string | null;
  monthlyAmount: number;
  currency: string;
  lastOperatorName: string | null; // oxirgi gaplashgan operator (CallLog'dan)
};

type Operator = { id: string; name: string };

export function ClientsTable({
  clients,
  operators,
  canManage,
  sort,
  dir,
}: {
  clients: ClientRow[];
  operators: Operator[];
  canManage: boolean;
  sort: string;
  dir: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOp, setAssignOp] = useState("");
  const [pending, startTransition] = useTransition();

  // Sahifa/filtr/saralash o'zgarganda (yangi clients ro'yxati) tanlovni tozalash —
  // ko'rinmayotgan mijozni tasodifan biriktirmaslik uchun.
  useEffect(() => {
    setSelected(new Set());
  }, [clients]);

  const allSelected = clients.length > 0 && clients.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(clients.map((c) => c.id)));
  }

  function changeSort(col: string) {
    const sp = new URLSearchParams(params.toString());
    const nextDir = sort === col && dir === "asc" ? "desc" : "asc";
    sp.set("sort", col);
    sp.set("dir", nextDir);
    sp.set("page", "1");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function doAssign() {
    const ids = [...selected];
    const operatorId = assignOp === "__unassign__" ? null : assignOp;
    startTransition(async () => {
      const res = await bulkAssignOperator(ids, operatorId);
      if (res.ok) {
        setSelected(new Set());
        setAssignOp("");
        router.refresh();
        toast(`${res.count} ta mijoz biriktirildi`, "success");
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  function SortHeader({ col, label, className = "" }: { col: string; label: string; className?: string }) {
    const active = sort === col;
    return (
      <th className={"px-4 py-3 font-medium " + className}>
        <button
          onClick={() => changeSort(col)}
          className="inline-flex items-center gap-1 hover:text-slate-900"
        >
          {label}
          {active ? (
            dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />
          )}
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {/* Ommaviy biriktirish paneli */}
      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-800">
            {selected.size} ta tanlandi (ushbu sahifada)
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={assignOp}
              onChange={(e) => setAssignOp(e.target.value)}
              className="h-9 w-56"
            >
              <option value="">Operatorni tanlang…</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
              <option value="__unassign__">— Biriktirishni olib tashlash</option>
            </Select>
            <Button onClick={doAssign} disabled={!assignOp || pending} size="sm">
              <UserCheck className="h-4 w-4" />
              {pending ? "..." : "Biriktirish"}
            </Button>
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4" /> Bekor
          </button>
        </div>
      )}

      {/* Desktop jadval */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              {canManage && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300"
                    aria-label="Hammasini tanlash"
                  />
                </th>
              )}
              <SortHeader col="restaurantName" label="Mijoz" />
              <SortHeader col="region" label="Viloyat" />
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Oxirgi operator</th>
              <th className="px-4 py-3 font-medium">Holat</th>
              <th className="px-4 py-3 font-medium">To'lov holati</th>
              <SortHeader col="monthlyAmount" label="Oylik" />
              <SortHeader col="nextPaymentDate" label="Keyingi to'lov" />
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={canManage ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                  Mijoz topilmadi
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr
                key={c.id}
                className={
                  "border-b border-slate-100 last:border-0 hover:bg-slate-50 " +
                  (selected.has(c.id) ? "bg-blue-50/40" : "")
                }
              >
                {canManage && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded border-slate-300"
                      aria-label="Tanlash"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link href={`/mijozlar/${c.id}`} className="block">
                    <div className="font-medium text-slate-900">{c.restaurantName || c.fullName || "—"}</div>
                    <div className="text-xs text-slate-500">{c.fullName}</div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.region ?? "—"}</td>
                <td className="px-4 py-3">
                  <a
                    href={`tel:${normalizePhone(c.phone)}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {formatPhone(c.phone)}
                  </a>
                </td>
                <td className="px-4 py-3">
                  {c.lastOperatorName ? (
                    <span className="text-slate-600">{c.lastOperatorName}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3"><ClientStatusBadge status={c.status} /></td>
                <td className="px-4 py-3"><PaymentStatusBadge nextPaymentDate={c.nextPaymentDate} /></td>
                <td className="px-4 py-3 font-medium text-slate-700">{formatMoney(c.monthlyAmount, c.currency)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(c.nextPaymentDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil kartalar */}
      <div className="space-y-2 md:hidden">
        {clients.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            Mijoz topilmadi
          </div>
        )}
        {clients.map((c) => (
          <div
            key={c.id}
            className={
              "rounded-xl border border-slate-200 bg-white p-3 " +
              (selected.has(c.id) ? "ring-2 ring-blue-300" : "")
            }
          >
            <div className="flex items-start gap-3">
              {canManage && (
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  aria-label="Tanlash"
                />
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/mijozlar/${c.id}`} className="block">
                  <div className="font-medium text-slate-900">{c.restaurantName || c.fullName || "—"}</div>
                  <div className="text-xs text-slate-500">{c.fullName}</div>
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ClientStatusBadge status={c.status} />
                  <PaymentStatusBadge nextPaymentDate={c.nextPaymentDate ? new Date(c.nextPaymentDate) : null} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <a
                    href={`tel:${normalizePhone(c.phone)}`}
                    className="inline-flex items-center gap-1 font-medium text-blue-600"
                  >
                    <Phone className="h-4 w-4" /> {formatPhone(c.phone)}
                  </a>
                  <span className="font-medium text-slate-700">{formatMoney(c.monthlyAmount, c.currency)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-slate-500">
                  <span>{c.region ?? "—"}{c.lastOperatorName ? ` · ${c.lastOperatorName}` : ""}</span>
                  <span>To'lov: {formatDate(c.nextPaymentDate)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

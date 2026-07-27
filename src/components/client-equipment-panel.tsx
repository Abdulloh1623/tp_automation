"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Undo2, AlertCircle, Check, Clock, Plus, Trash2, PackageCheck } from "lucide-react";
import {
  assignEquipmentBatchToClient,
  requestEquipmentReturn,
  type EquipmentSource,
} from "@/actions/equipment";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ownershipLabel } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";

export type EqItem = {
  id: string;
  name: string;
  ownership: string;
  quantity: number;
  rentalPrice: number;
  salePrice: number;
};
export type EqTypeOpt = {
  id: string;
  name: string;
  rentalPrice: number;
  salePrice: number;
  warehouse: number;
};
/** Ustaning zaxirasidagi uskunalar (o'zi olib borgan) — manba tanlash uchun. */
export type UstaSource = {
  ustaId: string;
  ustaName: string;
  items: { equipmentTypeId: string; quantity: number }[];
};

type Row = { key: number; typeId: string; qty: string };

export function ClientEquipmentPanel({
  clientId,
  role,
  currency,
  items,
  types,
  ustaSources,
  pendingReturn,
}: {
  clientId: string;
  role: string;
  currency: string;
  items: EqItem[];
  types: EqTypeOpt[];
  ustaSources: UstaSource[];
  pendingReturn: { status: string; note: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [aOwn, setAOwn] = useState("RENTAL");
  const [aSource, setASource] = useState("WAREHOUSE");
  // "Allaqachon o'rnatilgan" — oldindan mavjud mijoz uchun: ombordan qoldiq
  // ayirilmaydi, sotuvda yangi to'lov yozilmaydi (uskuna allaqachon mijozda).
  const [installed, setInstalled] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ key: 1, typeId: types[0]?.id ?? "", qty: "1" }]);
  const [seq, setSeq] = useState(1);

  const [rNote, setRNote] = useState("");

  const isManager = role === "ADMIN" || role === "MANAGER";
  const canReturn = role === "ADMIN" || role === "MANAGER" || role === "OPERATOR";
  const hasRental = items.some((i) => i.ownership === "RENTAL" && i.quantity > 0);

  // Manba ro'yxati (umumiy — barcha qatorlarga): ombor + zaxirasi bor ustalar.
  const sourceOptions = useMemo(() => {
    const opts = [{ key: "WAREHOUSE", label: "Sklad (ombor)" }];
    for (const u of ustaSources) {
      opts.push({ key: `USTA:${u.ustaId}`, label: `Usta: ${u.ustaName}` });
    }
    return opts;
  }, [ustaSources]);
  const effSource = sourceOptions.some((o) => o.key === aSource)
    ? aSource
    : (sourceOptions[0]?.key ?? "WAREHOUSE");

  // Tanlangan manbadagi mavjud qoldiq (tur bo'yicha).
  function availFor(typeId: string): number {
    if (effSource.startsWith("USTA:")) {
      const uid = effSource.slice(5);
      return (
        ustaSources.find((u) => u.ustaId === uid)?.items.find((i) => i.equipmentTypeId === typeId)
          ?.quantity ?? 0
      );
    }
    return types.find((t) => t.id === typeId)?.warehouse ?? 0;
  }

  function addRow() {
    const next = seq + 1;
    setSeq(next);
    setRows((rs) => [...rs, { key: next, typeId: types[0]?.id ?? "", qty: "1" }]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }
  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(okMsg);
        toast(okMsg, "success");
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  // Biror qatorda qoldiqdan oshib ketganmi? Server ham tekshiradi (tranzaksiya
  // ichida), lekin forma to'ldirilgach xato olish o'rniga darhol to'xtatamiz.
  const overLimit = rows.some(
    (r) => !installed && r.typeId && Number(r.qty) > availFor(r.typeId),
  );

  function submitAssign() {
    const list = rows
      .map((r) => ({ equipmentTypeId: r.typeId, quantity: Number(r.qty) }))
      .filter((i) => i.equipmentTypeId && i.quantity > 0);
    if (list.length === 0) {
      setErr("Kamida bitta texnika va miqdor kiriting");
      return;
    }
    if (overLimit) {
      const msg = "Manbada yetarli emas — miqdorni kamaytiring yoki boshqa manba tanlang";
      setErr(msg);
      toast(msg, "error");
      return;
    }
    const source: EquipmentSource = effSource.startsWith("USTA:")
      ? { type: "USTA", ustaId: effSource.slice(5) }
      : { type: "WAREHOUSE" };
    run(async () => {
      const res = await assignEquipmentBatchToClient(clientId, list, aOwn, source, {
        alreadyInstalled: installed,
      });
      if (res.ok) {
        setRows([{ key: seq + 1, typeId: types[0]?.id ?? "", qty: "1" }]);
        setSeq((s) => s + 1);
      }
      return res;
    }, "Uskunalar biriktirildi");
  }

  return (
    <div className="space-y-4">
      {(msg || err) && (
        <div
          className={
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm " +
            (err ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300")
          }
        >
          {err ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {err ?? msg}
        </div>
      )}

      {/* Joriy uskunalar */}
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Biriktirilgan uskuna yo'q</p>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {i.name} ×{i.quantity}
                </span>
                <Badge tone={i.ownership === "RENTAL" ? "blue" : "green"}>
                  {ownershipLabel(i.ownership)}
                </Badge>
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {i.ownership === "RENTAL"
                  ? `${formatMoney(i.rentalPrice * i.quantity, currency)}/oy`
                  : formatMoney(i.salePrice * i.quantity, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Qaytarish holati */}
      {pendingReturn && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">
              Qaytarish arizasi:{" "}
              {pendingReturn.status === "PENDING"
                ? "manager tasdig'i kutilmoqda"
                : "tasdiqlangan — usta olib keladi"}
            </div>
            {pendingReturn.note && (
              <div className="text-amber-700 dark:text-amber-300">{pendingReturn.note}</div>
            )}
          </div>
        </div>
      )}

      {/* Manager: bir yoki bir nechta uskuna biriktirish */}
      {isManager && (
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Uskuna biriktirish</div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Egalik</Label>
              <Select value={aOwn} onChange={(e) => setAOwn(e.target.value)}>
                <option value="RENTAL">Ijara</option>
                <option value="SOLD">Sotuv</option>
              </Select>
            </div>
            <div>
              <Label>Manba (qayerdan)</Label>
              {/* "Allaqachon o'rnatilgan" belgilanganda manba tushunchasi YO'Q —
                  uskuna hech qayerdan olinmaydi. Ilgari bu yerda o'chirilgan
                  (disabled) select "Sklad (ombor)" ni ko'rsatib turardi va
                  checkbox matni bilan ziddiyat hosil qilardi. */}
              {installed ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <PackageCheck className="h-4 w-4 shrink-0" />
                  Mijozda — hech qayerdan olinmaydi
                </div>
              ) : (
                <Select value={effSource} onChange={(e) => setASource(e.target.value)}>
                  {sourceOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
              {/* Bu qoida AYNAN manba tanloviga tegishli — shu sabab select
                  ostida turadi (ilgari checkbox ostida edi va chalkashtirardi). */}
              {!installed && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Usta o'zi olib borgan bo'lsa — usta zaxirasidan; ombordan olib
                  ketilsa — Sklad.
                </p>
              )}
            </div>
          </div>

          <label
            className={
              "flex items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors " +
              (installed
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200")
            }
          >
            <input
              type="checkbox"
              checked={installed}
              onChange={(e) => setInstalled(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Uskuna allaqachon mijozda (yangi o'rnatish emas)
              <span className="block text-xs opacity-80">
                Oldindan mavjud mijozni tizimga kiritish uchun: ombor/usta qoldig'i
                ayirilmaydi va sotuvda yangi to'lov yozilmaydi.
              </span>
            </span>
          </label>

          {/* Texnika qatorlari */}
          <div className="space-y-2">
            {rows.map((r) => {
              const avail = availFor(r.typeId);
              const over = !installed && Number(r.qty) > avail;
              return (
                <div key={r.key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label>Texnika</Label>
                    <Select
                      value={r.typeId}
                      onChange={(e) => updateRow(r.key, { typeId: e.target.value })}
                    >
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-32">
                    <div className="flex items-baseline justify-between gap-1">
                      <Label>Miqdor</Label>
                      {/* Qoldiq — miqdor maydonining O'ZIDA, o'qiladigan kontrastda
                          (ilgari kichik va oqish kulrang edi, e'tibordan qolardi). */}
                      {!installed && (
                        <span
                          className={
                            "text-[11px] font-medium " +
                            (over
                              ? "text-red-600 dark:text-red-400"
                              : "text-slate-600 dark:text-slate-300")
                          }
                        >
                          mavjud {avail}
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      min={1}
                      // Ombordan olinayotganda brauzer ham chegarani biladi
                      max={installed ? undefined : avail}
                      value={r.qty}
                      onChange={(e) => updateRow(r.key, { qty: e.target.value })}
                      aria-invalid={over}
                      className={over ? "border-red-400 dark:border-red-700" : ""}
                    />
                    {installed ? (
                      <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        ombordan ayirilmaydi
                      </p>
                    ) : (
                      over && (
                        <p className="mt-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                          faqat {avail} ta bor
                        </p>
                      )
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    className="mb-5 h-9 w-9 shrink-0 p-0 text-slate-400 hover:text-red-600"
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(r.key)}
                    aria-label="Qatorni o'chirish"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" className="text-sm" onClick={addRow} disabled={pending}>
              <Plus className="h-4 w-4" /> Texnika qo'shish
            </Button>
            <Button disabled={pending || overLimit} onClick={submitAssign}>
              <PackagePlus className="h-4 w-4" /> Biriktirish
            </Button>
          </div>
        </div>
      )}

      {/* Operator/manager: qaytarish arizasi */}
      {canReturn && hasRental && !pendingReturn && (
        <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Uskunani qaytarish (ijara)
          </div>
          <Textarea
            rows={2}
            value={rNote}
            onChange={(e) => setRNote(e.target.value)}
            placeholder="Sabab / izoh (majburiy)"
          />
          <Button
            variant="outline"
            className="border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
            disabled={pending}
            onClick={() =>
              run(
                () => requestEquipmentReturn(clientId, rNote),
                "Qaytarish arizasi yuborildi",
              )
            }
          >
            <Undo2 className="h-4 w-4" /> Qaytarish arizasi
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";
import type { EqTypeOpt, UstaSource } from "@/components/client-equipment-panel";

type Row = { key: number; typeId: string; qty: string; ownership: string; price: string };

/**
 * Yangi mijoz formasidagi uskuna tanlagich: "Faqat ilova" yoki "Uskunalar bilan".
 * Uskuna bilan bo'lsa — manba + qatorlar (tur, miqdor, ijara/sotuv, narx). Narx
 * turdan standart keladi, tahrirlanadi. Yashirin inputlar orqali formaga boradi:
 * eqMode, eqSource, eqTypeId[], eqQty[], eqOwnership[], eqPrice[].
 */
export function ClientEquipmentPicker({
  types,
  ustaSources,
  currency,
}: {
  types: EqTypeOpt[];
  ustaSources: UstaSource[];
  currency: string;
}) {
  const [withEquipment, setWithEquipment] = useState(false);
  const [source, setSource] = useState("WAREHOUSE");
  const [seq, setSeq] = useState(1);

  const defaultPrice = (typeId: string, ownership: string): string => {
    const t = types.find((x) => x.id === typeId);
    if (!t) return "0";
    return String(ownership === "SOLD" ? t.salePrice : t.rentalPrice);
  };

  const firstType = types[0]?.id ?? "";
  const [rows, setRows] = useState<Row[]>([
    { key: 1, typeId: firstType, qty: "1", ownership: "RENTAL", price: defaultPrice(firstType, "RENTAL") },
  ]);

  const sourceOptions = useMemo(() => {
    const opts = [
      { key: "WAREHOUSE", label: "Sklad (ombor)" },
      ...ustaSources.map((u) => ({ key: `USTA:${u.ustaId}`, label: `Usta: ${u.ustaName}` })),
      { key: "INSTALLED", label: "Allaqachon o'rnatilgan (ombordan ayrilmaydi)" },
    ];
    return opts;
  }, [ustaSources]);

  const installed = source === "INSTALLED";

  function availFor(typeId: string): number {
    if (source.startsWith("USTA:")) {
      const uid = source.slice(5);
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
    setRows((rs) => [
      ...rs,
      { key: next, typeId: firstType, qty: "1", ownership: "RENTAL", price: defaultPrice(firstType, "RENTAL") },
    ]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }
  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Tur yoki egalik o'zgarsa — narxni shu tur/egalik standartiga tiklaymiz.
        if (patch.typeId !== undefined || patch.ownership !== undefined) {
          next.price = defaultPrice(next.typeId, next.ownership);
        }
        return next;
      }),
    );
  }

  // Jonli hisob
  const rentalMonthly = rows
    .filter((r) => r.ownership === "RENTAL")
    .reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.qty) || 0), 0);
  const saleTotal = rows
    .filter((r) => r.ownership === "SOLD")
    .reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.qty) || 0), 0);

  return (
    <div className="space-y-3">
      <input type="hidden" name="eqMode" value={withEquipment ? "EQUIPMENT" : "PROGRAM"} />

      <div className="grid gap-2 sm:grid-cols-2">
        <label
          className={
            "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm " +
            (!withEquipment
              ? "border-primary-400 bg-primary-50/50 dark:bg-primary-950/30"
              : "border-slate-200 dark:border-slate-800")
          }
        >
          <input
            type="radio"
            name="eqModeRadio"
            checked={!withEquipment}
            onChange={() => setWithEquipment(false)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-slate-800 dark:text-slate-100">Faqat ilova</span>
            <span className="block text-xs text-slate-400 dark:text-slate-500">
              Uskunasiz — faqat dastur obunasi
            </span>
          </span>
        </label>
        <label
          className={
            "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm " +
            (withEquipment
              ? "border-primary-400 bg-primary-50/50 dark:bg-primary-950/30"
              : "border-slate-200 dark:border-slate-800")
          }
        >
          <input
            type="radio"
            name="eqModeRadio"
            checked={withEquipment}
            onChange={() => setWithEquipment(true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-slate-800 dark:text-slate-100">Uskunalar bilan</span>
            <span className="block text-xs text-slate-400 dark:text-slate-500">
              Sotuv yoki ijara asosida uskuna biriktiriladi
            </span>
          </span>
        </label>
      </div>

      {withEquipment && (
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
          {types.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Avval Ombor bo'limida uskuna turlarini yarating.
            </p>
          ) : (
            <>
              <input type="hidden" name="eqSource" value={source} />
              <div>
                <Label>Manba (qayerdan)</Label>
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  {sourceOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                {rows.map((r) => {
                  const avail = availFor(r.typeId);
                  const over = !installed && Number(r.qty) > avail;
                  return (
                    <div
                      key={r.key}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 sm:grid-cols-[1fr_5rem_6rem_7rem_auto] sm:items-end"
                    >
                      {/* Yashirin inputlar — formaga boradi */}
                      <input type="hidden" name="eqTypeId" value={r.typeId} />
                      <input type="hidden" name="eqQty" value={r.qty} />
                      <input type="hidden" name="eqOwnership" value={r.ownership} />
                      <input type="hidden" name="eqPrice" value={r.price} />

                      <div>
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
                      <div>
                        <Label>Miqdor</Label>
                        <Input
                          type="number"
                          min={1}
                          value={r.qty}
                          onChange={(e) => updateRow(r.key, { qty: e.target.value })}
                          className={over ? "border-red-300 dark:border-red-700" : ""}
                        />
                        {!installed && (
                          <p
                            className={
                              "mt-0.5 text-[11px] " +
                              (over
                                ? "text-red-600 dark:text-red-400"
                                : "text-slate-400 dark:text-slate-500")
                            }
                          >
                            mavjud: {avail}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label>Egalik</Label>
                        <Select
                          value={r.ownership}
                          onChange={(e) => updateRow(r.key, { ownership: e.target.value })}
                        >
                          <option value="RENTAL">Ijara</option>
                          <option value="SOLD">Sotuv</option>
                        </Select>
                      </div>
                      <div>
                        <Label>{r.ownership === "SOLD" ? "Narx" : "Narx/oy"}</Label>
                        <MoneyInput
                          value={r.price}
                          onValueChange={(raw) => updateRow(r.key, { price: raw })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 w-9 shrink-0 p-0 text-slate-400 hover:text-red-600"
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

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" className="text-sm" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Texnika qo'shish
                </Button>
                <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                  {rentalMonthly > 0 && (
                    <div>
                      Ijara (oylik):{" "}
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {formatMoney(rentalMonthly, currency)}
                      </span>
                    </div>
                  )}
                  {saleTotal > 0 && (
                    <div>
                      Sotuv (bir martalik, shu oy):{" "}
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {formatMoney(saleTotal, currency)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Ijara summasi oylik to'lovga (MRR) qo'shiladi; sotuv esa shu oy daromadiga bitta
                to'lov sifatida yoziladi. Narxlar turdan standart keladi — tahrirlash mumkin.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

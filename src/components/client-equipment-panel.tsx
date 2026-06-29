"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Undo2, AlertCircle, Check, Clock } from "lucide-react";
import {
  assignEquipmentToClient,
  requestEquipmentReturn,
} from "@/actions/equipment";
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

export function ClientEquipmentPanel({
  clientId,
  role,
  currency,
  items,
  types,
  pendingReturn,
}: {
  clientId: string;
  role: string;
  currency: string;
  items: EqItem[];
  types: EqTypeOpt[];
  pendingReturn: { status: string; note: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [aType, setAType] = useState(types[0]?.id ?? "");
  const [aOwn, setAOwn] = useState("RENTAL");
  const [aQty, setAQty] = useState("1");

  const [rNote, setRNote] = useState("");

  const isManager = role === "ADMIN" || role === "MANAGER";
  const canReturn = role === "ADMIN" || role === "MANAGER" || role === "OPERATOR";
  const hasRental = items.some((i) => i.ownership === "RENTAL" && i.quantity > 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(okMsg);
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
      }
    });
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

      {/* Manager: uskuna biriktirish */}
      {isManager && (
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Uskuna biriktirish</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Texnika</Label>
              <Select value={aType} onChange={(e) => setAType(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (omborda: {t.warehouse})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Egalik</Label>
              <Select value={aOwn} onChange={(e) => setAOwn(e.target.value)}>
                <option value="RENTAL">Ijara</option>
                <option value="SOLD">Sotuv</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-2">
            <div>
              <Label>Miqdor</Label>
              <Input
                type="number"
                min={1}
                value={aQty}
                onChange={(e) => setAQty(e.target.value)}
              />
            </div>
            <Button
              disabled={pending || !aType}
              onClick={() =>
                run(
                  () => assignEquipmentToClient(clientId, aType, aOwn, Number(aQty)),
                  "Uskuna biriktirildi",
                )
              }
            >
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

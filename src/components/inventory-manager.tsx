"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PackagePlus,
  ArrowRight,
  ArrowLeftRight,
  Trash2,
  AlertCircle,
  Check,
  Plus,
  Power,
  ClipboardCheck,
  X,
} from "lucide-react";
import {
  addStock,
  transferToUsta,
  updateEquipmentType,
  createEquipmentType,
  setEquipmentTypeActive,
  returnFromUsta,
  adjustInventory,
  scrapToBrak,
} from "@/actions/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export type InvType = {
  id: string;
  name: string;
  rentalPrice: number;
  salePrice: number;
  minStock: number;
  isActive: boolean;
  warehouse: number;
};
export type UstaStock = {
  ustaId: string;
  ustaName: string;
  items: { name: string; quantity: number }[];
};
type Usta = { id: string; name: string };

export function InventoryManager({
  types,
  ustalar,
  ustaStock,
  brak,
}: {
  types: InvType[];
  ustalar: Usta[];
  ustaStock: UstaStock[];
  brak: { name: string; quantity: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const active = types.filter((t) => t.isActive);

  const [fields, setFields] = useState<Record<string, { r: string; s: string; m: string }>>(
    Object.fromEntries(
      types.map((t) => [
        t.id,
        { r: String(t.rentalPrice), s: String(t.salePrice), m: String(t.minStock) },
      ]),
    ),
  );

  const [showCreate, setShowCreate] = useState(false);
  const [nt, setNt] = useState({ name: "", r: "0", s: "0", m: "0" });

  const [inType, setInType] = useState(active[0]?.id ?? "");
  const [inQty, setInQty] = useState("1");

  const [trType, setTrType] = useState(active[0]?.id ?? "");
  const [trUsta, setTrUsta] = useState(ustalar[0]?.id ?? "");
  const [trQty, setTrQty] = useState("1");
  const [trNote, setTrNote] = useState("");

  const [rfType, setRfType] = useState(active[0]?.id ?? "");
  const [rfUsta, setRfUsta] = useState(ustalar[0]?.id ?? "");
  const [rfQty, setRfQty] = useState("1");

  const [ivType, setIvType] = useState(active[0]?.id ?? "");
  const [ivQty, setIvQty] = useState("");

  const [brSource, setBrSource] = useState("WAREHOUSE");
  const [brType, setBrType] = useState(active[0]?.id ?? "");
  const [brQty, setBrQty] = useState("1");
  const [brNote, setBrNote] = useState("");

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

  const ivCurrent = types.find((t) => t.id === ivType)?.warehouse ?? 0;

  return (
    <div className="space-y-5">
      {(msg || err) && (
        <div
          className={
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm " +
            (err ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")
          }
        >
          {err ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {err ?? msg}
        </div>
      )}

      {/* Texnika turlari + narx + min qoldiq */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Texnika turlari</CardTitle>
          <Button size="sm" onClick={() => { setNt({ name: "", r: "0", s: "0", m: "0" }); setShowCreate(true); }}>
            <Plus className="h-4 w-4" /> Yangi tur
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Texnika</th>
                  <th className="px-4 py-3 font-medium">Ijara narx</th>
                  <th className="px-4 py-3 font-medium">Sotuv narx</th>
                  <th className="px-4 py-3 font-medium">Min. qoldiq</th>
                  <th className="px-4 py-3 text-center font-medium">Omborda</th>
                  <th className="px-4 py-3 text-right font-medium">Amal</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => {
                  const f = fields[t.id] ?? { r: "", s: "", m: "" };
                  const low = t.isActive && t.minStock > 0 && t.warehouse < t.minStock;
                  const saveField = (data: { rentalPrice?: number; salePrice?: number; minStock?: number }) =>
                    run(() => updateEquipmentType(t.id, data), `${t.name} yangilandi`);
                  return (
                    <tr key={t.id} className={"border-b border-slate-100 last:border-0 " + (t.isActive ? "" : "opacity-50")}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {t.name}
                        {!t.isActive && <span className="ml-2 text-xs text-slate-400">(nofaol)</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Input type="number" min={0} value={f.r}
                          onChange={(e) => setFields((p) => ({ ...p, [t.id]: { ...p[t.id], r: e.target.value } }))}
                          onBlur={() => Number(f.r) !== t.rentalPrice && saveField({ rentalPrice: Number(f.r) })}
                          className="h-8 w-24 text-sm" />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input type="number" min={0} value={f.s}
                          onChange={(e) => setFields((p) => ({ ...p, [t.id]: { ...p[t.id], s: e.target.value } }))}
                          onBlur={() => Number(f.s) !== t.salePrice && saveField({ salePrice: Number(f.s) })}
                          className="h-8 w-24 text-sm" />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input type="number" min={0} value={f.m}
                          onChange={(e) => setFields((p) => ({ ...p, [t.id]: { ...p[t.id], m: e.target.value } }))}
                          onBlur={() => Number(f.m) !== t.minStock && saveField({ minStock: Number(f.m) })}
                          className="h-8 w-20 text-sm" />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={"font-medium " + (low ? "text-red-600" : "text-slate-700")}>
                          {t.warehouse}
                        </span>
                        {low && (
                          <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            kam
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm"
                          className={"h-7 px-2 text-xs " + (t.isActive ? "text-amber-600" : "text-emerald-600")}
                          disabled={pending}
                          onClick={() => run(() => setEquipmentTypeActive(t.id, !t.isActive), t.isActive ? "Faolsizlantirildi" : "Yoqildi")}>
                          <Power className="h-3.5 w-3.5" /> {t.isActive ? "Faolsiz" : "Yoqish"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Kirim */}
        <Card>
          <CardHeader><CardTitle>Omborga kirim</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Texnika</Label>
                <Select value={inType} onChange={(e) => setInType(e.target.value)}>
                  {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Miqdor</Label>
                <Input type="number" min={1} value={inQty} onChange={(e) => setInQty(e.target.value)} />
              </div>
            </div>
            <Button disabled={pending || !inType}
              onClick={() => run(() => addStock(inType, Number(inQty)), "Omborga kirim qilindi")}>
              <PackagePlus className="h-4 w-4" /> Kirim
            </Button>
          </CardContent>
        </Card>

        {/* Ustaga taqsimot */}
        <Card>
          <CardHeader><CardTitle>Ustaga taqsimot</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Texnika</Label>
                <Select value={trType} onChange={(e) => setTrType(e.target.value)}>
                  {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Usta</Label>
                <Select value={trUsta} onChange={(e) => setTrUsta(e.target.value)}>
                  {ustalar.length === 0 && <option value="">Usta yo'q</option>}
                  {ustalar.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Miqdor</Label>
                <Input type="number" min={1} value={trQty} onChange={(e) => setTrQty(e.target.value)} />
              </div>
              <div>
                <Label>Izoh *</Label>
                <Input value={trNote} onChange={(e) => setTrNote(e.target.value)} placeholder="majburiy" />
              </div>
            </div>
            <Button disabled={pending || !trUsta}
              onClick={() => run(() => transferToUsta(trType, trUsta, Number(trQty), trNote), "Ustaga berildi")}>
              <ArrowRight className="h-4 w-4" /> Berish
            </Button>
          </CardContent>
        </Card>

        {/* Ustadan qaytarish */}
        <Card>
          <CardHeader><CardTitle>Ustadan omborga qaytarish</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Usta</Label>
                <Select value={rfUsta} onChange={(e) => setRfUsta(e.target.value)}>
                  {ustalar.length === 0 && <option value="">Usta yo'q</option>}
                  {ustalar.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Texnika</Label>
                <Select value={rfType} onChange={(e) => setRfType(e.target.value)}>
                  {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label>Miqdor</Label>
              <Input type="number" min={1} value={rfQty} onChange={(e) => setRfQty(e.target.value)} className="w-32" />
            </div>
            <Button variant="outline" disabled={pending || !rfUsta}
              onClick={() => run(() => returnFromUsta(rfType, rfUsta, Number(rfQty)), "Ombor qaytarildi")}>
              <ArrowLeftRight className="h-4 w-4" /> Qaytarish
            </Button>
          </CardContent>
        </Card>

        {/* Inventarizatsiya */}
        <Card>
          <CardHeader><CardTitle>Inventarizatsiya (sanoq)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Texnika</Label>
                <Select value={ivType} onChange={(e) => setIvType(e.target.value)}>
                  {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Haqiqiy sanoq</Label>
                <Input type="number" min={0} value={ivQty} onChange={(e) => setIvQty(e.target.value)}
                  placeholder={`hozir: ${ivCurrent}`} />
              </div>
            </div>
            <p className="text-xs text-slate-400">Hozirgi qoldiq: {ivCurrent} dona. Farq jurnalga yoziladi.</p>
            <Button variant="outline" disabled={pending || ivQty === ""}
              onClick={() => run(() => adjustInventory(ivType, Number(ivQty)), "Sanoq saqlandi")}>
              <ClipboardCheck className="h-4 w-4" /> Saqlash
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Brakka chiqarish */}
      <Card>
        <CardHeader><CardTitle>Brakka chiqarish (izoh majburiy)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>Manba</Label>
              <Select value={brSource} onChange={(e) => setBrSource(e.target.value)}>
                <option value="WAREHOUSE">Ombor</option>
                {ustalar.map((u) => <option key={u.id} value={"USTA:" + u.id}>{u.name} (usta)</option>)}
              </Select>
            </div>
            <div>
              <Label>Texnika</Label>
              <Select value={brType} onChange={(e) => setBrType(e.target.value)}>
                {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Miqdor</Label>
              <Input type="number" min={1} value={brQty} onChange={(e) => setBrQty(e.target.value)} />
            </div>
            <div>
              <Label>Izoh *</Label>
              <Input value={brNote} onChange={(e) => setBrNote(e.target.value)} placeholder="sabab" />
            </div>
          </div>
          <Button variant="outline" className="border-red-300 text-red-700" disabled={pending}
            onClick={() => {
              const isUsta = brSource.startsWith("USTA:");
              run(() => scrapToBrak(brType, isUsta ? "USTA" : "WAREHOUSE", isUsta ? brSource.slice(5) : "WAREHOUSE", Number(brQty), brNote), "Brakka chiqarildi");
            }}>
            <Trash2 className="h-4 w-4" /> Brakka chiqarish
          </Button>
          {brak.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-500">Brakda:</span>
              {brak.map((b) => <span key={b.name}>{b.name}: <b>{b.quantity}</b></span>)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usta zaxiralari */}
      <Card>
        <CardHeader><CardTitle>Usta zaxiralari</CardTitle></CardHeader>
        <CardContent>
          {ustaStock.length === 0 ? (
            <p className="text-sm text-slate-400">Ustalarda zaxira yo'q</p>
          ) : (
            <div className="space-y-3">
              {ustaStock.map((u) => (
                <div key={u.ustaId} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 pb-2 last:border-0">
                  <span className="font-medium text-slate-800">{u.ustaName}</span>
                  {u.items.length === 0 ? (
                    <span className="text-sm text-slate-400">—</span>
                  ) : (
                    u.items.map((i) => <span key={i.name} className="text-sm text-slate-600">{i.name}: <b>{i.quantity}</b></span>)
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yangi tur modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Yangi texnika turi</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nomi</Label>
                <Input value={nt.name} onChange={(e) => setNt((p) => ({ ...p, name: e.target.value }))} placeholder="masalan: Skaner" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Ijara</Label><Input type="number" min={0} value={nt.r} onChange={(e) => setNt((p) => ({ ...p, r: e.target.value }))} /></div>
                <div><Label>Sotuv</Label><Input type="number" min={0} value={nt.s} onChange={(e) => setNt((p) => ({ ...p, s: e.target.value }))} /></div>
                <div><Label>Min.</Label><Input type="number" min={0} value={nt.m} onChange={(e) => setNt((p) => ({ ...p, m: e.target.value }))} /></div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={pending}
                onClick={() => run(async () => {
                  const res = await createEquipmentType({ name: nt.name, rentalPrice: Number(nt.r), salePrice: Number(nt.s), minStock: Number(nt.m) });
                  if (res.ok) setShowCreate(false);
                  return res;
                }, "Tur qo'shildi")}>
                Qo'shish
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Bekor</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PackagePlus,
  ArrowRight,
  ArrowLeftRight,
  Trash2,
  Pencil,
  AlertCircle,
  Check,
  Plus,
  Power,
  ClipboardCheck,
  Printer,
  FileText,
  Upload,
  X,
} from "lucide-react";
import {
  addStock,
  transferBatchToUsta,
  uploadHandoutFile,
  updateEquipmentType,
  createEquipmentType,
  deleteEquipmentType,
  setEquipmentTypeActive,
  returnFromUsta,
  adjustInventory,
  scrapToBrak,
} from "@/actions/inventory";
import { HANDOUT_MODE, type HandoutMode } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
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

  const [showCreate, setShowCreate] = useState(false);
  const [nt, setNt] = useState({ name: "", r: "0", s: "0", m: "0" });

  // Texnika turlari CRUD — tahrirlash / o'chirish modal holati.
  const [editType, setEditType] = useState<InvType | null>(null);
  const [ef, setEf] = useState({ name: "", r: "0", s: "0", m: "0" });
  const [confirmEdit, setConfirmEdit] = useState(false); // tahrirni tasdiqlash bosqichi
  const [delType, setDelType] = useState<InvType | null>(null);

  function openEdit(t: InvType) {
    setConfirmEdit(false);
    setEf({ name: t.name, r: String(t.rentalPrice), s: String(t.salePrice), m: String(t.minStock) });
    setEditType(t);
  }

  const [inType, setInType] = useState(active[0]?.id ?? "");
  const [inQty, setInQty] = useState("1");

  // Ustaga taqsimot — bitta ustaga bir nechta texnika (dinamik qatorlar).
  type TrRow = { equipmentId: string; quantity: number };
  const [trUsta, setTrUsta] = useState(ustalar[0]?.id ?? "");
  const [trNote, setTrNote] = useState("");
  const [trRows, setTrRows] = useState<TrRow[]>([
    { equipmentId: active[0]?.id ?? "", quantity: 1 },
  ]);
  const [trMode, setTrMode] = useState<HandoutMode>("WITH_DOC"); // default: hujjat bilan
  const [trFile, setTrFile] = useState<File | null>(null); // imzolangan hujjat (ixtiyoriy)
  const addTrRow = () =>
    setTrRows((rows) => [...rows, { equipmentId: active[0]?.id ?? "", quantity: 1 }]);
  const removeTrRow = (i: number) =>
    setTrRows((rows) => rows.filter((_, idx) => idx !== i));
  const setTrRow = (i: number, patch: Partial<TrRow>) =>
    setTrRows((rows) => rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  // Hujjatsiz yuborishda izoh majburiy — submit shu bilan bloklanadi.
  const trNoteMissing = trMode === "WITHOUT_DOC" && !trNote.trim();

  // Chop etiladigan topshirish hujjati (Chiqarib yuborish / Qabul qilish) mockup'i.
  function printHandover() {
    const usta = ustalar.find((u) => u.id === trUsta);
    const items = trRows
      .map((r) => {
        const t = active.find((a) => a.id === r.equipmentId);
        return t ? { name: t.name, qty: r.quantity } : null;
      })
      .filter((x): x is { name: string; qty: number } => x !== null);
    const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
    const rowsHtml = items
      .map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td style="text-align:center">${i.qty}</td></tr>`)
      .join("");
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Topshirish hujjati</title>
      <style>
        body{font-family:Arial,sans-serif;padding:40px;color:#111}
        h1{font-size:20px;text-align:center;margin-bottom:4px}
        .sub{text-align:center;color:#555;font-size:13px;margin-bottom:24px}
        table{width:100%;border-collapse:collapse;margin:16px 0}
        th,td{border:1px solid #999;padding:8px;font-size:14px}
        th{background:#f0f0f0;text-align:left}
        .sign{display:flex;justify-content:space-between;margin-top:56px;font-size:14px}
        .sign div{width:45%}
        .line{border-top:1px solid #333;margin-top:40px;padding-top:6px;color:#555}
      </style></head><body>
      <h1>TEXNIKANI TOPSHIRISH HUJJATI</h1>
      <div class="sub">Chiqarib yuborish / Qabul qilish</div>
      <p><b>Usta (qabul qiluvchi):</b> ${esc(usta?.name ?? "—")}</p>
      <table><thead><tr><th style="width:40px">№</th><th>Texnika</th><th style="width:80px">Miqdor</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="3" style="text-align:center;color:#999">— texnika tanlanmagan —</td></tr>`}</tbody></table>
      ${trNote.trim() ? `<p><b>Izoh:</b> ${esc(trNote.trim())}</p>` : ""}
      <div class="sign">
        <div><div class="line">Topshirdi (ombor) — imzo, sana</div></div>
        <div><div class="line">Qabul qildi (usta) — imzo, sana</div></div>
      </div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

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
            (err ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300")
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
                <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                  const low = t.isActive && t.minStock > 0 && t.warehouse < t.minStock;
                  return (
                    <tr key={t.id} className={"border-b border-slate-100 dark:border-slate-800 last:border-0 " + (t.isActive ? "" : "opacity-50")}>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {t.name}
                        {!t.isActive && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(nofaol)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{t.rentalPrice}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{t.salePrice}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{t.minStock}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={"font-medium " + (low ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200")}>
                          {t.warehouse}
                        </span>
                        {low && (
                          <span className="ml-1 rounded-full bg-red-100 dark:bg-red-950 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                            kam
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm"
                            className="h-7 px-2 text-xs text-blue-600 dark:text-blue-400"
                            disabled={pending}
                            onClick={() => openEdit(t)}>
                            <Pencil className="h-3.5 w-3.5" /> Tahrirlash
                          </Button>
                          <Button variant="ghost" size="sm"
                            className={"h-7 px-2 text-xs " + (t.isActive ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}
                            disabled={pending}
                            onClick={() => run(() => setEquipmentTypeActive(t.id, !t.isActive), t.isActive ? "Faolsizlantirildi" : "Yoqildi")}>
                            <Power className="h-3.5 w-3.5" /> {t.isActive ? "Faolsiz" : "Yoqish"}
                          </Button>
                          <Button variant="ghost" size="sm"
                            className="h-7 px-2 text-xs text-red-600 dark:text-red-400"
                            disabled={pending}
                            onClick={() => setDelType(t)}>
                            <Trash2 className="h-3.5 w-3.5" /> O'chirish
                          </Button>
                        </div>
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

        {/* Ustaga taqsimot — bitta ustaga bir nechta texnika */}
        <Card>
          <CardHeader><CardTitle>Ustaga taqsimot</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Usta</Label>
              <Select value={trUsta} onChange={(e) => setTrUsta(e.target.value)}>
                {ustalar.length === 0 && <option value="">Usta yo'q</option>}
                {ustalar.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>

            <div className="space-y-2">
              {trRows.map((row, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    {i === 0 && <Label>Texnika</Label>}
                    <Select value={row.equipmentId} onChange={(e) => setTrRow(i, { equipmentId: e.target.value })}>
                      {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </div>
                  <div className="w-24">
                    {i === 0 && <Label>Miqdor</Label>}
                    {/* "01" bug'iga qarshi: 0 bo'lsa bo'sh ko'rsatiladi, parse leading-zero'ni yechadi */}
                    <Input type="number" min={1} inputMode="numeric"
                      value={row.quantity === 0 ? "" : row.quantity}
                      onChange={(e) => setTrRow(i, { quantity: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  <Button variant="ghost" size="sm" type="button"
                    className="h-10 px-2 text-slate-400 hover:text-red-600 disabled:opacity-30"
                    disabled={trRows.length === 1}
                    aria-label="Qatorni o'chirish"
                    onClick={() => removeTrRow(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <button type="button" onClick={addTrRow}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
              <Plus className="h-4 w-4" /> Texnika qo'shish
            </button>

            {/* Topshirish rejimi — hujjat bilan / hujjatsiz */}
            <div>
              <Label>Topshirish usuli</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(HANDOUT_MODE) as HandoutMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => setTrMode(mode)}
                    className={
                      "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                      (trMode === mode
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                        : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")
                    }>
                    <FileText className="h-4 w-4" /> {HANDOUT_MODE[mode]}
                  </button>
                ))}
              </div>
            </div>

            {/* Hujjat bilan: chop etish + imzolangan faylni biriktirish (ixtiyoriy) */}
            {trMode === "WITH_DOC" && (
              <div className="space-y-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Topshirish hujjati</span>
                  <button type="button" onClick={printHandover}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Printer className="h-3.5 w-3.5" /> Chop etish
                  </button>
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Upload className="h-4 w-4 shrink-0" />
                  <span className="truncate">{trFile ? trFile.name : "Imzolangan hujjat (PDF/JPG) — ixtiyoriy, keyin ham yuklash mumkin"}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" className="hidden"
                    onChange={(e) => setTrFile(e.target.files?.[0] ?? null)} />
                </label>
                {trFile && (
                  <button type="button" onClick={() => setTrFile(null)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline">Faylni olib tashlash</button>
                )}
              </div>
            )}

            <div>
              <Label>
                Izoh {trMode === "WITHOUT_DOC" && <span className="text-red-600 dark:text-red-400">*</span>}
              </Label>
              <Input value={trNote} onChange={(e) => setTrNote(e.target.value)}
                placeholder={trMode === "WITHOUT_DOC" ? "majburiy" : "ixtiyoriy"}
                className={trNoteMissing ? "border-red-400 dark:border-red-600" : ""} />
              {trNoteMissing && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Hujjatsiz yuborish uchun izoh kiritish majburiy!
                </p>
              )}
            </div>

            <Button disabled={pending || !trUsta || trNoteMissing}
              onClick={() =>
                run(async () => {
                  // Hujjat bilan + fayl tanlangan bo'lsa: avval faylni yuklaymiz (pipeline).
                  let url: string | undefined;
                  if (trMode === "WITH_DOC" && trFile) {
                    const fd = new FormData();
                    fd.append("file", trFile);
                    const up = await uploadHandoutFile(fd);
                    if (!up.ok || !up.url) return { ok: false, error: up.error ?? "Hujjat yuklashda xatolik" };
                    url = up.url;
                  }
                  const res = await transferBatchToUsta(
                    trUsta,
                    trRows.map((r) => ({ equipmentId: r.equipmentId, quantity: Number(r.quantity) })),
                    trNote,
                    trMode,
                    url,
                  );
                  if (res.ok) {
                    setTrFile(null);
                    setTrNote("");
                    setTrRows([{ equipmentId: active[0]?.id ?? "", quantity: 1 }]);
                  }
                  return res;
                }, "Ustaga berildi")
              }>
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
            <p className="text-xs text-slate-400 dark:text-slate-500">Hozirgi qoldiq: {ivCurrent} dona. Farq jurnalga yoziladi.</p>
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
          <Button variant="outline" className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300" disabled={pending}
            onClick={() => {
              const isUsta = brSource.startsWith("USTA:");
              run(() => scrapToBrak(brType, isUsta ? "USTA" : "WAREHOUSE", isUsta ? brSource.slice(5) : "WAREHOUSE", Number(brQty), brNote), "Brakka chiqarildi");
            }}>
            <Trash2 className="h-4 w-4" /> Brakka chiqarish
          </Button>
          {brak.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 dark:border-slate-800 pt-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-500 dark:text-slate-400">Brakda:</span>
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
            <p className="text-sm text-slate-400 dark:text-slate-500">Ustalarda zaxira yo'q</p>
          ) : (
            <div className="space-y-3">
              {ustaStock.map((u) => (
                <div key={u.ustaId} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{u.ustaName}</span>
                  {u.items.length === 0 ? (
                    <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                  ) : (
                    u.items.map((i) => <span key={i.name} className="text-sm text-slate-600 dark:text-slate-300">{i.name}: <b>{i.quantity}</b></span>)
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
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Yangi texnika turi</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nomi</Label>
                <Input value={nt.name} onChange={(e) => setNt((p) => ({ ...p, name: e.target.value }))} placeholder="masalan: Skaner" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Ijara</Label><MoneyInput value={nt.r} onValueChange={(v) => setNt((p) => ({ ...p, r: v }))} /></div>
                <div><Label>Sotuv</Label><MoneyInput value={nt.s} onValueChange={(v) => setNt((p) => ({ ...p, s: v }))} /></div>
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

      {/* Tahrirlash modal — saqlashda tasdiq so'raladi */}
      {editType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditType(null)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Texnikani tahrirlash</h3>
              <button onClick={() => setEditType(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nomi</Label>
                <Input value={ef.name} onChange={(e) => { setEf((p) => ({ ...p, name: e.target.value })); setConfirmEdit(false); }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Ijara</Label><MoneyInput value={ef.r} onValueChange={(v) => { setEf((p) => ({ ...p, r: v })); setConfirmEdit(false); }} /></div>
                <div><Label>Sotuv</Label><MoneyInput value={ef.s} onValueChange={(v) => { setEf((p) => ({ ...p, s: v })); setConfirmEdit(false); }} /></div>
                <div><Label>Min.</Label><Input type="number" min={0} value={ef.m} onChange={(e) => { setEf((p) => ({ ...p, m: e.target.value })); setConfirmEdit(false); }} /></div>
              </div>
            </div>
            {err && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {err}
              </div>
            )}
            {confirmEdit && !err && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Haqiqatdan ham ushbu texnikani tahrirlashni xohlaysizmi?
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {!confirmEdit ? (
                <Button disabled={pending} onClick={() => setConfirmEdit(true)}>
                  <Check className="h-4 w-4" /> Saqlash
                </Button>
              ) : (
                <Button disabled={pending}
                  onClick={() => run(async () => {
                    const res = await updateEquipmentType(editType.id, {
                      name: ef.name,
                      rentalPrice: Number(ef.r),
                      salePrice: Number(ef.s),
                      minStock: Number(ef.m),
                    });
                    if (res.ok) setEditType(null);
                    return res;
                  }, "Texnika yangilandi")}>
                  <Check className="h-4 w-4" /> Ha, saqlash
                </Button>
              )}
              <Button variant="ghost" onClick={() => setEditType(null)}>Bekor</Button>
            </div>
          </div>
        </div>
      )}

      {/* O'chirish tasdig'i modal — ogohlantirish bilan */}
      {delType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDelType(null)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
              </span>
              <h3 className="text-base font-semibold">Texnikani o'chirish</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Haqiqatdan ham <b>{delType.name}</b> texnikasini o'chirishni xohlaysizmi?
              Bu amalni ortga qaytarib bo'lmaydi. Zaxira, mijoz biriktiruvi yoki harakat
              tarixi bo'lsa, o'chirishga ruxsat berilmaydi.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300" disabled={pending}
                onClick={() => {
                  const id = delType.id;
                  setDelType(null); // modalni yopamiz — natija (muvaffaqiyat/xato) yuqoridagi bannerda ko'rinadi
                  run(() => deleteEquipmentType(id), "Texnika o'chirildi");
                }}>
                <Trash2 className="h-4 w-4" /> Ha, o'chirish
              </Button>
              <Button variant="ghost" onClick={() => setDelType(null)}>Bekor</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

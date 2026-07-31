"use client";

// Mijoz profilidagi "Uskunalar" bo'limi.
//
// Ilgari ikkala forma — biriktirish (egalik, manba, checkbox, texnika
// qatorlari) va qaytarish arizasi — bo'lim ichida DOIM ochiq turardi. Natijada
// "mijozda qanday uskuna bor?" degan oddiy savolga javob olish uchun ham uzun
// forma orasidan qidirishga to'g'ri kelardi. Endi bo'lim faqat holatni
// ko'rsatadi, amallar esa to'lov/soliq oynalari bilan bir xil `Modal` qobig'ida
// ochiladi.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PackagePlus,
  Undo2,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  PackageCheck,
} from "lucide-react";
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
import { Modal } from "@/components/ui/modal";
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
  clientName,
  role,
  currency,
  items,
  types,
  ustaSources,
  pendingReturn,
}: {
  clientId: string;
  /** Oyna sarlavhasi ostida ko'rinadi — qaysi mijoz ekani aniq bo'lsin. */
  clientName: string;
  role: string;
  currency: string;
  items: EqItem[];
  types: EqTypeOpt[];
  ustaSources: UstaSource[];
  pendingReturn: { status: string; note: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

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

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    onDone: () => void,
  ) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast(okMsg, "success");
        onDone();
        router.refresh();
      } else {
        setErr(res.error ?? "Xatolik");
      }
    });
  }

  // Biror qatorda qoldiqdan oshib ketganmi? Server ham tekshiradi (tranzaksiya
  // ichida), lekin forma to'ldirilgach xato olish o'rniga darhol to'xtatamiz.
  const overLimit = rows.some(
    (r) => !installed && r.typeId && Number(r.qty) > availFor(r.typeId),
  );

  function openAssign() {
    setErr(null);
    setAssignOpen(true);
  }

  function openReturn() {
    setErr(null);
    setRNote("");
    setReturnOpen(true);
  }

  function submitAssign() {
    const list = rows
      .map((r) => ({ equipmentTypeId: r.typeId, quantity: Number(r.qty) }))
      .filter((i) => i.equipmentTypeId && i.quantity > 0);
    if (list.length === 0) {
      setErr("Kamida bitta texnika va miqdor kiriting");
      return;
    }
    if (overLimit) {
      setErr("Manbada yetarli emas — miqdorni kamaytiring yoki boshqa manba tanlang");
      return;
    }
    const source: EquipmentSource = effSource.startsWith("USTA:")
      ? { type: "USTA", ustaId: effSource.slice(5) }
      : { type: "WAREHOUSE" };
    run(
      () =>
        assignEquipmentBatchToClient(clientId, list, aOwn, source, {
          alreadyInstalled: installed,
        }),
      "Uskunalar biriktirildi",
      () => {
        setRows([{ key: seq + 1, typeId: types[0]?.id ?? "", qty: "1" }]);
        setSeq((s) => s + 1);
        setInstalled(false);
        setAssignOpen(false);
      },
    );
  }

  const errorBox = err && (
    <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
      <AlertCircle className="h-4 w-4 shrink-0" /> {err}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Joriy uskunalar */}
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Biriktirilgan uskuna yo&apos;q</p>
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

      {/* Amallar — formalar o'rniga oynani ochadigan tugmalar */}
      {(isManager || (canReturn && hasRental && !pendingReturn)) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {isManager && (
            <Button variant="outline" size="sm" onClick={openAssign}>
              <PackagePlus className="h-4 w-4" /> Uskuna biriktirish
            </Button>
          )}
          {canReturn && hasRental && !pendingReturn && (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300"
              onClick={openReturn}
            >
              <Undo2 className="h-4 w-4" /> Qaytarish arizasi
            </Button>
          )}
        </div>
      )}

      {/* --- Biriktirish oynasi --- */}
      <Modal
        open={assignOpen}
        onClose={() => !pending && setAssignOpen(false)}
        size="lg"
        title="Uskuna biriktirish"
        subtitle={clientName}
        icon={<PackagePlus className="h-4 w-4" />}
        note={
          installed
            ? "Uskuna allaqachon mijozda — ombor/usta qoldig'i o'zgarmaydi."
            : "Qoldiq tanlangan manbadan ayiriladi."
        }
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAssignOpen(false)}
              disabled={pending}
            >
              Bekor
            </Button>
            <Button size="sm" disabled={pending || overLimit} onClick={submitAssign}>
              Biriktirish
            </Button>
          </>
        }
      >
        {errorBox}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`own-${clientId}`}>Egalik</Label>
            <Select id={`own-${clientId}`} value={aOwn} onChange={(e) => setAOwn(e.target.value)}>
              <option value="RENTAL">Ijara</option>
              <option value="SOLD">Sotuv</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`src-${clientId}`}>Manba (qayerdan)</Label>
            {/* "Allaqachon o'rnatilgan" belgilanganda manba tushunchasi YO'Q —
                uskuna hech qayerdan olinmaydi. Ilgari bu yerda o'chirilgan
                (disabled) select "Sklad (ombor)" ni ko'rsatib turardi va
                checkbox matni bilan ziddiyat hosil qilardi. */}
            {installed ? (
              <div className="flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <PackageCheck className="h-4 w-4 shrink-0" />
                Mijozda
              </div>
            ) : (
              <Select
                id={`src-${clientId}`}
                value={effSource}
                onChange={(e) => setASource(e.target.value)}
              >
                {sourceOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {!installed && (
          <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">
            Usta o&apos;zi olib borgan bo&apos;lsa — usta zaxirasidan; ombordan olib ketilsa —
            Sklad.
          </p>
        )}

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
            Uskuna allaqachon mijozda (yangi o&apos;rnatish emas)
            <span className="block text-xs opacity-80">
              Oldindan mavjud mijozni tizimga kiritish uchun: ombor/usta qoldig&apos;i ayirilmaydi
              va sotuvda yangi to&apos;lov yozilmaydi.
            </span>
          </span>
        </label>

        {/* Texnika qatorlari */}
        <div className="space-y-2">
          {rows.map((r) => {
            const avail = availFor(r.typeId);
            const over = !installed && Number(r.qty) > avail;
            return (
              // `items-start`: miqdor ustunida input ostida qo'shimcha qator
              // (mavjud/xato) bor — pastdan tekislansa "Texnika" va "Miqdor"
              // yorliqlari turli balandlikda qolib ketardi.
              <div key={r.key} className="flex items-start gap-2">
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
                <div className="w-28">
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
                  // Yorliq balandligi (satr + mb-1.5) — tugma input bilan bir chiziqda
                  className="mt-[26px] h-10 w-9 shrink-0 p-0 text-slate-400 hover:text-red-600"
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

        <Button variant="outline" size="sm" onClick={addRow} disabled={pending}>
          <Plus className="h-4 w-4" /> Texnika qo&apos;shish
        </Button>
      </Modal>

      {/* --- Qaytarish arizasi oynasi --- */}
      <Modal
        open={returnOpen}
        onClose={() => !pending && setReturnOpen(false)}
        title="Uskunani qaytarish"
        subtitle={clientName}
        icon={<Undo2 className="h-4 w-4" />}
        note="Ariza managerga boradi; tasdiqlangach usta uskunani olib keladi."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReturnOpen(false)}
              disabled={pending}
            >
              Bekor
            </Button>
            <Button
              size="sm"
              loading={pending}
              disabled={!rNote.trim()}
              onClick={() =>
                run(() => requestEquipmentReturn(clientId, rNote), "Qaytarish arizasi yuborildi", () =>
                  setReturnOpen(false),
                )
              }
            >
              Yuborish
            </Button>
          </>
        }
      >
        {errorBox}
        <div>
          <Label htmlFor={`rnote-${clientId}`}>Sabab / izoh</Label>
          <Textarea
            id={`rnote-${clientId}`}
            rows={3}
            value={rNote}
            onChange={(e) => setRNote(e.target.value)}
            placeholder="Nima uchun qaytarilmoqda?"
          />
        </div>
      </Modal>
    </div>
  );
}

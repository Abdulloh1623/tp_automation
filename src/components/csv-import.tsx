"use client";

import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import {
  importClients,
  type ImportMode,
  type ImportReport,
  type ImportRow,
} from "@/actions/import";
import { parseCsvWithHeader, type ParsedCsv } from "@/lib/csv";
import { IMPORT_FIELDS, guessMapping } from "@/lib/import-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const REQUIRED: string[] = ["fullName", "restaurantName", "phone"];

export function CsvImport() {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<ImportMode>("create");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);

  function ingest(text: string) {
    const p = parseCsvWithHeader(text);
    if (p.headers.length === 0 || p.rows.length === 0) {
      setError("CSV bo'sh yoki sarlavha/qatorlar topilmadi");
      setParsed(null);
      return;
    }
    setError(null);
    setReport(null);
    setParsed(p);
    setMapping(guessMapping(p.headers));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
  }

  function reset() {
    setParsed(null);
    setMapping({});
    setReport(null);
    setError(null);
    setPasteText("");
  }

  function buildRows(): ImportRow[] {
    if (!parsed) return [];
    return parsed.rows.map((cols) => {
      const row: ImportRow = {};
      for (const f of IMPORT_FIELDS) {
        const idx = mapping[f.key];
        row[f.key] = idx >= 0 ? (cols[idx] ?? "") : "";
      }
      return row;
    });
  }

  async function onImport() {
    setLoading(true);
    setReport(null);
    try {
      const res = await importClients({
        mode,
        defaultCurrency,
        rows: buildRows(),
        lines: parsed?.lines ?? [],
      });
      setReport(res);
    } catch {
      setError("Import vaqtida xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  const requiredMapped = REQUIRED.every((k) => (mapping[k] ?? -1) >= 0);
  const mappedFields = IMPORT_FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0);

  return (
    <div className="space-y-6">
      {/* 1-qadam: fayl yoki matn */}
      <Card>
        <CardHeader>
          <CardTitle>1. CSV faylni yuklang yoki joylashtiring</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center hover:border-blue-400 hover:bg-blue-50/40">
            <Upload className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              CSV faylni tanlang
            </span>
            <span className="text-xs text-slate-400">.csv</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFile}
            />
          </label>

          <div>
            <Label htmlFor="paste">Yoki CSV matnini joylashtiring</Label>
            <Textarea
              id="paste"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="FIO,Restoran nomi,Telefon..."
              className="min-h-[80px] font-mono text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => ingest(pasteText)}
              disabled={!pasteText.trim()}
            >
              Tahlil qilish
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && (
        <>
          {/* 2-qadam: ustun moslash */}
          <Card>
            <CardHeader>
              <CardTitle>2. Ustunlarni moslang</CardTitle>
              <p className="text-sm text-slate-500">
                {parsed.rows.length} ta qator topildi. Har bir maydonni CSV
                ustuniga bog'lang (* — majburiy).
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {IMPORT_FIELDS.map((f) => {
                  const required = REQUIRED.includes(f.key);
                  const missing = required && (mapping[f.key] ?? -1) < 0;
                  return (
                    <div key={f.key}>
                      <Label className="flex items-center gap-1">
                        {f.label}
                        {required && <span className="text-red-500">*</span>}
                      </Label>
                      <Select
                        value={String(mapping[f.key] ?? -1)}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            [f.key]: Number(e.target.value),
                          }))
                        }
                        className={missing ? "border-red-300" : ""}
                      >
                        <option value="-1">— yo'q —</option>
                        {parsed.headers.map((h, idx) => (
                          <option key={idx} value={String(idx)}>
                            {h || `Ustun ${idx + 1}`}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 3-qadam: oldindan ko'rish */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>3. Oldindan ko'rish (dastlabki 5 qator)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-left text-slate-500">
                      {mappedFields.map((f) => (
                        <th key={f.key} className="px-3 py-2 font-medium">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((cols, r) => (
                      <tr key={r} className="border-b border-slate-100">
                        {mappedFields.map((f) => (
                          <td key={f.key} className="px-3 py-2 text-slate-700">
                            {cols[mapping[f.key]] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 4-qadam: rejim + import */}
          <Card>
            <CardHeader>
              <CardTitle>4. Import rejimi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "create"}
                    onChange={() => setMode("create")}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Faqat yangi qo'shish</span>
                    <span className="block text-xs text-slate-500">
                      Har bir qator yangi mijoz sifatida qo'shiladi
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "update"}
                    onChange={() => setMode("update")}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-medium">
                      Telefon bo'yicha yangilash
                    </span>
                    <span className="block text-xs text-slate-500">
                      Telefon mos kelsa mavjud mijoz yangilanadi, aks holda
                      yangisi qo'shiladi
                    </span>
                  </span>
                </label>
              </div>

              <div className="max-w-xs">
                <Label htmlFor="defaultCurrency">Standart valyuta</Label>
                <Select
                  id="defaultCurrency"
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                >
                  <option value="USD">USD ($)</option>
                  <option value="UZS">UZS (so'm)</option>
                </Select>
                <p className="mt-1 text-xs text-slate-400">
                  Valyuta ustuni bog'lanmagan yoki bo'sh qatorlar uchun ishlatiladi
                </p>
              </div>

              {!requiredMapped && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Import uchun FIO, Restoran nomi va Telefon maydonlari bog'lanishi
                  shart
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={onImport}
                  disabled={!requiredMapped || loading}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {loading
                    ? "Import qilinmoqda..."
                    : `${parsed.rows.length} ta qatorni import qilish`}
                </Button>
                <Button type="button" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-4 w-4" />
                  Tozalash
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Natija */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Import natijasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.unauthorized ? (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Sizda import qilish huquqi yo'q (faqat administrator)
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {report.created} ta qo'shildi
                  </div>
                  <div className="text-sm text-blue-700">
                    {report.updated} ta yangilandi
                  </div>
                  <div className="text-sm text-slate-500">
                    {report.skipped} ta o'tkazib yuborildi
                  </div>
                </div>
                {report.errors.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {report.errors.map((e, i) => (
                      <div key={i}>
                        {e.row}-qator: {e.message}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

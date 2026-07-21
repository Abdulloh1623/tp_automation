"use client";

import { useActionState, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  KeyRound,
  Copy,
} from "lucide-react";
import {
  previewBulk,
  commitBulk,
  type PreviewState,
  type CommitState,
} from "@/actions/bulk";
import { ENTITIES, ENTITY_KEYS, type BulkEntityKey } from "@/lib/bulk/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toaster";

/**
 * Shablon asosida ommaviy yuklash.
 *
 * Oqim: tur tanlanadi -> shablon yuklab olinadi -> to'ldirilgan fayl
 * yuklanadi -> DASTUR TEKSHIRADI va nima bo'lishini ko'rsatadi -> tasdiqlanadi.
 * Tekshiruvsiz yozish yo'q (backupdan tiklash bilan bir xil yondashuv).
 */
export function BulkUpload() {
  const [entity, setEntity] = useState<BulkEntityKey>("mijozlar");
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(
    previewBulk,
    {},
  );
  const [commit, commitAction, committing] = useActionState<CommitState, FormData>(
    commitBulk,
    {},
  );

  const def = ENTITIES[entity];
  // Tur almashsa oldingi tekshiruv natijasi tegishli bo'lmay qoladi.
  const previewValid = preview.ok && preview.entity === entity && !commit.ok;
  const errors = (preview.issues ?? []).filter((i) => i.kind === "error");
  const skips = (preview.issues ?? []).filter((i) => i.kind === "skip");

  const copyCredentials = () => {
    const text = (commit.credentials ?? [])
      .map((c) => `${c.name}\t${c.username}\t${c.password}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast("Parollar nusxalandi", "success"),
      () => toast("Nusxalab bo'lmadi", "error"),
    );
  };

  return (
    <div className="space-y-5">
      {/* Tur tanlash */}
      <div className="flex flex-wrap gap-2">
        {ENTITY_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setEntity(k)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
              (k === entity
                ? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-950/40 dark:text-primary-300"
                : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800")
            }
          >
            {ENTITIES[k].title}
          </button>
        ))}
      </div>

      {/* 1: shablon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700">
              1
            </span>
            Shablonni yuklab oling
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <a href={`/api/shablon/${entity}`} download>
            <Button type="button" variant="outline">
              <Download className="mr-2 h-4 w-4" />
              {def.title} shabloni (.xlsx)
            </Button>
          </a>
          <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {def.notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Faylda ikkinchi varaq — &quot;Ko&apos;rsatma&quot;: har bir ustun uchun izoh bor.
            Sarlavha qatorini o&apos;zgartirmang; namuna qatorini o&apos;chirishingiz shart emas.
          </p>
        </CardContent>
      </Card>

      {/* 2: yuklash va tekshirish */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700">
              2
            </span>
            To&apos;ldirilgan faylni yuklang
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Dastur avval tekshiradi va nima bo&apos;lishini ko&apos;rsatadi — bazaga hech narsa
            yozilmaydi.
          </p>
        </CardHeader>
        <CardContent>
          <form action={previewAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="entity" value={entity} />
            <input
              type="file"
              name="file"
              accept=".xlsx,.csv"
              required
              className="block w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
            />
            <Button type="submit" disabled={previewing}>
              {previewing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Tekshirilmoqda...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Tekshirish
                </>
              )}
            </Button>
          </form>

          {preview.error && (
            <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{preview.error}</span>
            </div>
          )}

          {previewValid && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {preview.ready} ta qator yozishga tayyor
                {errors.length > 0 && ` · ${errors.length} ta xato`}
                {skips.length > 0 && ` · ${skips.length} ta o'tkaziladi`}
              </div>

              {(preview.unknownColumns?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  E&apos;tiborga olinmagan ustunlar: {preview.unknownColumns!.join(", ")}
                </p>
              )}

              {preview.issues!.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <tbody>
                      {preview.issues!.map((i, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        >
                          <td className="w-20 px-3 py-1.5 text-slate-400">{i.line}-qator</td>
                          <td
                            className={
                              "px-3 py-1.5 " +
                              (i.kind === "error"
                                ? "text-red-600 dark:text-red-400"
                                : "text-amber-600 dark:text-amber-400")
                            }
                          >
                            {i.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <form action={commitAction}>
                <input type="hidden" name="token" value={preview.token ?? ""} />
                <Button type="submit" disabled={committing}>
                  {committing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Yozilmoqda...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" /> {preview.ready} ta qatorni yuklash
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Natija */}
      {commit.error && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{commit.error}</span>
        </div>
      )}

      {commit.ok && (
        <Card className="border-emerald-300 dark:border-emerald-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              Yuklandi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Yangi: <b>{commit.created ?? 0}</b>
              {commit.updated !== undefined && <> · Yangilandi: <b>{commit.updated}</b></>}
              {commit.skipped !== undefined && <> · O&apos;tkazildi: <b>{commit.skipped}</b></>}
            </p>
            {commit.message && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{commit.message}</p>
            )}

            {(commit.credentials?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <KeyRound className="h-4 w-4" />
                    Parollar — bu ro&apos;yxat FAQAT HOZIR ko&apos;rinadi
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={copyCredentials}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Nusxalash
                  </Button>
                </div>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Sahifa yopilgach qayta ko&apos;rsatilmaydi. Nusxa olib, xodimlarga xavfsiz
                  yetkazing.
                </p>
                <div className="mt-3 max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-amber-700/70 dark:text-amber-400/70">
                        <th className="pb-1 font-medium">Xodim</th>
                        <th className="pb-1 font-medium">Login</th>
                        <th className="pb-1 font-medium">Parol</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {commit.credentials!.map((c) => (
                        <tr key={c.username}>
                          <td className="py-0.5 pr-3 font-sans">{c.name}</td>
                          <td className="py-0.5 pr-3">{c.username}</td>
                          <td className="py-0.5 font-semibold">{c.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

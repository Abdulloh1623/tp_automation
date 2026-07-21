"use client";

import { useActionState, useState } from "react";
import {
  ShieldAlert,
  FileCheck2,
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Wrench,
} from "lucide-react";
import {
  verifyBackupUpload,
  restoreFromBackup,
  stopMaintenance,
  type VerifyState,
  type RestoreState,
} from "@/actions/restore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/toaster";

/**
 * Backupdan tiklash — IKKI BOSQICHLI.
 *
 * 1) "Tekshirish" — fayl vaqtinchalik bazaga tiklanadi va sanaladi. Jonli
 *    bazaga tegilmaydi. Faqat shundan keyin token beriladi.
 * 2) "Tiklash" — token bilan; yozib tasdiqlash talab qilinadi. Server tomonda
 *    avval avtomatik xavfsizlik nusxasi olinadi va texnik tanaffus yoqiladi.
 *
 * Tugmalar ataylab ajratilgan: tiklash bosqichi tekshiruvsiz OCHILMAYDI.
 */
export function BackupRestore({ maintenanceActive }: { maintenanceActive: boolean }) {
  const [verify, verifyAction, verifying] = useActionState<VerifyState, FormData>(
    verifyBackupUpload,
    {},
  );
  const [restore, restoreAction, restoring] = useActionState<RestoreState, FormData>(
    restoreFromBackup,
    {},
  );
  const [confirmText, setConfirmText] = useState("");
  const [stopping, setStopping] = useState(false);

  const verified = verify.ok && verify.token;
  const done = restore.ok;

  return (
    <div className="space-y-5">
      {/* Ogohlantirish — bu bo'limning eng muhim matni */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="text-sm text-red-800 dark:text-red-300">
            <p className="font-semibold">Tiklash butun bazani almashtiradi</p>
            <p className="mt-1">
              Tiklashdan keyin hozirgi barcha ma'lumot backup fayldagi holat bilan
              almashadi — oradagi to'lovlar, qo'ng'iroqlar va o'zgarishlar yo'qoladi.
              Tiklash paytida xodimlar uchun texnik tanaffus yoqiladi. Server
              tiklashdan oldin avtomatik xavfsizlik nusxasi oladi. Barcha xodimlar
              (jumladan siz) qayta kirishlari kerak bo'ladi — sessiyalar ham
              backupdagi holatga qaytadi.
            </p>
          </div>
        </div>
      </div>

      {maintenanceActive && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex gap-3 text-sm text-amber-800 dark:text-amber-300">
            <Wrench className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Texnik tanaffus yoqilgan</p>
              <p className="mt-1">
                Hozir sizdan boshqa hech kim tizimga kira olmaydi. Tiklash tugagan
                bo'lsa, tanaffusni tugating.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={stopping}
            onClick={async () => {
              setStopping(true);
              const r = await stopMaintenance();
              setStopping(false);
              if (r.ok) {
                toast("Texnik tanaffus tugatildi", "success");
                location.reload();
              } else {
                toast(r.error ?? "Xato", "error");
              }
            }}
          >
            {stopping ? "..." : "Tanaffusni tugatish"}
          </Button>
        </div>
      )}

      {/* 1-BOSQICH */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700">
              1
            </span>
            Faylni yuklash va tekshirish
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Fayl vaqtinchalik bazaga tiklab ko'riladi — jonli bazaga tegilmaydi.
            Qabul qilinadi: <code>.sql</code>, <code>.sql.gz</code>,{" "}
            <code>.sql.gz.enc</code> (shifrlangan).
          </p>
        </CardHeader>
        <CardContent>
          <form action={verifyAction} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="backup"
              accept=".sql,.gz,.enc"
              required
              className="block w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
            />
            <Button type="submit" disabled={verifying}>
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Tekshirilmoqda...
                </>
              ) : (
                <>
                  <FileCheck2 className="mr-2 h-4 w-4" /> Tekshirish
                </>
              )}
            </Button>
          </form>

          {verifying && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Vaqtinchalik baza yaratilib, dump unga tiklanmoqda. Katta bazada bu bir
              necha daqiqa olishi mumkin.
            </p>
          )}

          {verify.error && (
            <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{verify.error}</span>
            </div>
          )}

          {verified && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Tekshiruvdan o'tdi — bu backup tiklanadi
              </div>
              {verify.fileName && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Fayl: {verify.fileName}
                  {verify.info?.pgDumpVersion && ` · pg_dump ${verify.info.pgDumpVersion}`}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                      <th className="pb-2 font-medium">Jadval</th>
                      <th className="pb-2 text-right font-medium">Qatorlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verify.info?.tables ?? []).slice(0, 10).map((t) => (
                      <tr
                        key={t.table}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="py-1.5 text-slate-700 dark:text-slate-200">{t.table}</td>
                        <td className="py-1.5 text-right tabular-nums">{t.rows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(verify.warnings?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  {verify.warnings!.map((w, i) => (
                    <div key={i}>⚠️ {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2-BOSQICH — faqat tekshiruvdan keyin */}
      <Card className={verified ? "border-red-300 dark:border-red-800" : "opacity-60"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700">
              2
            </span>
            Bazani tiklash
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {verified
              ? "Tasdiqlash uchun quyidagi katakka katta harflar bilan TIKLASH deb yozing."
              : "Avval 1-bosqichdan o'ting — tekshirilmagan fayl tiklanmaydi."}
          </p>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Baza tiklandi
              </div>
              <ul className="text-sm text-slate-600 dark:text-slate-300">
                {(restore.restored ?? []).map((t) => (
                  <li key={t.table}>
                    {t.table}: <span className="tabular-nums">{t.rows}</span> qator
                  </li>
                ))}
              </ul>
              {restore.safetyBackup && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Tiklashdan oldingi xavfsizlik nusxasi:{" "}
                  <code>backups/{restore.safetyBackup}</code>
                </p>
              )}
              {restore.loggedOut && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  Sizning hisobingiz tiklangan bazada topilmadi — keyingi harakatda
                  tizimdan chiqarilasiz. Tiklangan bazadagi login/parol bilan kiring.
                </p>
              )}
            </div>
          ) : (
            <form action={restoreAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="token" value={verify.token ?? ""} />
              <Input
                name="confirm"
                placeholder="TIKLASH"
                autoComplete="off"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={!verified || restoring}
                className="max-w-[200px]"
              />
              <Button
                type="submit"
                variant="danger"
                disabled={!verified || restoring || confirmText !== "TIKLASH"}
              >
                {restoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Tiklanmoqda...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" /> Bazani tiklash
                  </>
                )}
              </Button>
            </form>
          )}

          {restore.error && (
            <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{restore.error}</p>
                {restore.safetyBackup && (
                  <p className="mt-1 text-xs">
                    Xavfsizlik nusxasi: <code>backups/{restore.safetyBackup}</code>
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-slate-400 dark:text-slate-500">
        <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Backup fayllari har kuni Telegram zaxira kanaliga yuboriladi va serverdagi{" "}
        <code>backups/</code> papkasida saqlanadi.
      </p>
    </div>
  );
}

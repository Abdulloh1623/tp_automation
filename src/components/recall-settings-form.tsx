"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Save, TriangleAlert } from "lucide-react";
import { saveLoadPolicy, saveRecallRules } from "@/actions/recall-settings";
import {
  ALL_OUTCOMES,
  LOAD_POLICY_BOUNDS,
  MAX_RECALL_DAYS,
  OFF_BOARD_OUTCOMES,
  RECALL_MODE,
  autoDailyLimit,
  type LoadPolicy,
  type RecallMode,
  type RecallRules,
} from "@/lib/recall-rules";
import { leadOutcomeLabel, type LeadOutcome } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/toaster";

type Forecast = { day: string; count: number }[];

const POLICY_FIELDS: {
  key: keyof LoadPolicy;
  label: string;
  hint: string;
}[] = [
  {
    key: "minPerOperator",
    label: "Operatorga eng kam",
    hint: "Ro'yxat shundan kam bo'lsa, muddati eng yaqin lidlar oldinga tortiladi. 0 — tortmaslik.",
  },
  {
    key: "maxPerOperator",
    label: "Operatorga eng ko'p",
    hint: "Bir kunda shundan ortiq berilmaydi; ortig'i ertangi kunga qoladi.",
  },
  {
    key: "debtorCooldownDays",
    label: "Qarzdorni qayta ko'rsatish (kun)",
    hint: "Qarzdor bilan gaplashilgach, shu kun o'tmaguncha ro'yxatga qaytmaydi.",
  },
  {
    key: "escalationThreshold",
    label: "Eskalatsiya chegarasi (marta)",
    hint: "Shuncha marta ketma-ket ko'tarilmasa — avtomatik eskalatsiyaga (yoki 29$ bo'lsa otkazga).",
  },
  {
    key: "newClientMonths",
    label: "Yangi mijoz muddati (oy)",
    hint: "O'rnatilganiga shundan kam bo'lgan mijoz \"yangi\" hisoblanadi. 0 — qoida o'chiq.",
  },
  {
    key: "newClientMaxDays",
    label: "Yangi mijoz oralig'i (kun)",
    hint: "Yangi mijoz bilan aloqa shundan siyrak bo'lmaydi (otkaz va uskuna qaytarishdan tashqari).",
  },
];

export function RecallSettingsForm({
  rules: initialRules,
  policy: initialPolicy,
  operatorCount,
  dueToday,
  forecast,
}: {
  rules: RecallRules;
  policy: LoadPolicy;
  operatorCount: number;
  dueToday: number;
  forecast: Forecast;
}) {
  const router = useRouter();
  const [rules, setRules] = useState<RecallRules>(initialRules);
  const [policy, setPolicy] = useState<LoadPolicy>(initialPolicy);
  const [pending, start] = useTransition();

  const offBoard = new Set<string>(OFF_BOARD_OUTCOMES);

  // Prognoz — joriy taqvim bo'yicha. Chegaralarni o'zgartirsangiz sig'im
  // darhol qayta hisoblanadi; oraliqlar ta'siri esa kelgusi kunlar
  // ustunlarida bir necha kunda ko'rinadi.
  const autoLimit = useMemo(
    () => autoDailyLimit(dueToday, operatorCount, policy),
    [dueToday, operatorCount, policy],
  );
  const capacity = autoLimit * operatorCount;
  const backlog = Math.max(0, dueToday - capacity);
  const maxBar = Math.max(1, ...forecast.map((f) => f.count), dueToday);

  function setRule(outcome: LeadOutcome, patch: Partial<{ mode: RecallMode; days: number }>) {
    setRules((r) => ({ ...r, [outcome]: { ...r[outcome], ...patch } }));
  }
  function setPolicyField(key: keyof LoadPolicy, value: string) {
    const n = Number(value);
    setPolicy((p) => ({ ...p, [key]: Number.isFinite(n) ? n : 0 }));
  }

  function saveRules() {
    start(async () => {
      const res = await saveRecallRules(rules);
      toast(res.ok ? "Oraliqlar saqlandi" : (res.error ?? "Xatolik"), res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    });
  }
  function savePolicy() {
    start(async () => {
      const res = await saveLoadPolicy(policy);
      toast(res.ok ? "Yuklama saqlandi" : (res.error ?? "Xatolik"), res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Prognoz */}
      <Card>
        <CardHeader>
          <CardTitle>Bugungi holat va prognoz</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kunlik son shu hisobdan chiqadi: ro'yxat ÷ faol operatorlar, chegaralar ichida
          </p>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Bugungi ro'yxat" value={String(dueToday)} />
            <Stat label="Faol operator" value={String(operatorCount)} />
            <Stat label="Avtomatik kvota" value={String(autoLimit)} sub="operatorga" />
            <Stat
              label="Kechikish"
              value={String(backlog)}
              sub={backlog > 0 ? "ertaga qoladi" : "yo'q"}
              tone={backlog > 0 ? "warn" : "ok"}
            />
          </div>

          {backlog > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Ro&apos;yxat sig&apos;imdan katta: bugun {capacity} ta beriladi, {backlog} tasi
              ertaga qoladi. Oraliqlarni uzaytiring yoki &laquo;eng ko&apos;p&raquo; chegarasini
              oshiring.
            </p>
          )}

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              Kelgusi kunlar yuklamasi (rejalashtirilgan qayta aloqalar)
            </div>
            {forecast.every((f) => f.count === 0) ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Kelgusi {forecast.length} kunga rejalashtirilgan qayta aloqa yo&apos;q — grafik
                operatorlar natija yozgan sari to&apos;la boshlaydi.
              </p>
            ) : (
              <div className="flex items-end gap-1">
                {forecast.map((f) => (
                  <div key={f.day} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      title={`${f.day}: ${f.count} ta`}
                      className={
                        "w-full rounded-t " +
                        (f.count > capacity
                          ? "bg-amber-400 dark:bg-amber-500"
                          : "bg-primary-400 dark:bg-primary-600")
                      }
                      style={{ height: `${Math.max(2, Math.round((f.count / maxBar) * 56))}px` }}
                    />
                    <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                      {f.day.slice(8)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Sariq ustun — sig&apos;imdan oshgan kun. Oraliqlarni o&apos;zgartirsangiz bu
              grafik darhol emas, mijozlar bilan gaplashilgan sari o&apos;zgaradi.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Kunlik yuklama */}
      <Card>
        <CardHeader>
          <CardTitle>Kunlik yuklama</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {POLICY_FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type="number"
                  min={LOAD_POLICY_BOUNDS[f.key].min}
                  max={LOAD_POLICY_BOUNDS[f.key].max}
                  value={String(policy[f.key])}
                  onChange={(e) => setPolicyField(f.key, e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{f.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <SaveButton pending={pending} onClick={savePolicy} />
          </div>
        </CardContent>
      </Card>

      {/* Qayta aloqa oraliqlari */}
      <Card>
        <CardHeader>
          <CardTitle>Qayta aloqa oraliqlari</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Operator tanlagan natijaga qarab mijoz bilan qachon qayta gaplashiladi. Yangi
            qiymatlar faqat shundan keyingi natijalarga qo&apos;llanadi.
          </p>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Natija</th>
                  <th className="py-2 font-medium">Rejim</th>
                  <th className="py-2 text-right font-medium">Kun</th>
                </tr>
              </thead>
              <tbody>
                {ALL_OUTCOMES.map((o) => {
                  const rule = rules[o];
                  return (
                    <tr
                      key={o}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="py-2 pr-3">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {leadOutcomeLabel(o)}
                        </span>
                        {offBoard.has(o) && (
                          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                            boshqa oqimga o&apos;tadi
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Select
                          value={rule.mode}
                          onChange={(e) => setRule(o, { mode: e.target.value as RecallMode })}
                          aria-label={`${leadOutcomeLabel(o)} — rejim`}
                        >
                          {(Object.keys(RECALL_MODE) as RecallMode[]).map((m) => (
                            <option key={m} value={m}>
                              {RECALL_MODE[m]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={MAX_RECALL_DAYS}
                          className="ml-auto w-24 text-right"
                          disabled={rule.mode === "NONE"}
                          value={String(rule.days)}
                          onChange={(e) => setRule(o, { days: Number(e.target.value) })}
                          aria-label={`${leadOutcomeLabel(o)} — kun`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            <b>To&apos;lov sanasida</b> rejimida mijozning to&apos;lov sanasi olinadi; u
            bo&apos;lmasa yonidagi kun zaxira sifatida ishlatiladi.
          </p>
          <div className="mt-4">
            <SaveButton pending={pending} onClick={saveRules} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={
          "text-xl font-semibold " +
          (tone === "warn"
            ? "text-amber-600 dark:text-amber-400"
            : "text-slate-900 dark:text-slate-100")
        }
      >
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500">{sub}</div>}
    </div>
  );
}

function SaveButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
    >
      {pending ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
      {pending ? "Saqlanmoqda..." : "Saqlash"}
    </button>
  );
}

import { endOfDay, startOfDay, addDays } from "date-fns";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ACTIVE_STAGES, NO_CONTACT_STAGES, OFF_BOARD_STAGES } from "@/lib/constants";
import { getRecallSettings } from "@/lib/settings";
import { RecallSettingsForm } from "@/components/recall-settings-form";
import { PipelineStageManager } from "@/components/pipeline-stage-manager";
import { getAllMiddleStages } from "@/lib/pipeline-stages";
import { tzDayKey } from "@/lib/tz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sozlamalar" };

const FORECAST_DAYS = 14;

export default async function SettingsPage() {
  await requireRole(["ADMIN"]);

  const now = new Date();
  const today = endOfDay(now);
  const horizon = endOfDay(addDays(now, FORECAST_DAYS));

  const [settings, stagesByPipeline, operatorCount, dueToday, upcoming] = await Promise.all([
    getRecallSettings(),
    getAllMiddleStages(),
    db.user.count({ where: { role: "OPERATOR", isActive: true } }),
    // Bugungi ro'yxat — /lidlar bilan bir xil mezon (muddati kelganlar + qarzdorlar)
    db.client.count({
      where: {
        status: "ACTIVE",
        OR: [
          {
            stage: { in: [...ACTIVE_STAGES] },
            OR: [{ nextContactDate: { lte: today } }, { nextContactDate: null }],
          },
          {
            nextPaymentDate: { lt: startOfDay(now) },
            stage: { notIn: [...NO_CONTACT_STAGES, ...OFF_BOARD_STAGES] },
          },
        ],
      },
    }),
    db.client.findMany({
      where: {
        status: "ACTIVE",
        stage: { in: [...ACTIVE_STAGES] },
        nextContactDate: { gt: today, lte: horizon },
      },
      select: { nextContactDate: true },
    }),
  ]);

  // Kelgusi kunlar bo'yicha yuklama — taqvim haqiqatan qanday to'lganini
  // ko'rsatadi (oraliqlar ta'siri bir necha kunda shu grafikda ko'rinadi).
  const buckets = new Map<string, number>();
  for (let i = 1; i <= FORECAST_DAYS; i++) {
    buckets.set(tzDayKey(addDays(now, i)), 0);
  }
  for (const c of upcoming) {
    if (!c.nextContactDate) continue;
    const key = tzDayKey(c.nextContactDate);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const forecast = [...buckets.entries()].map(([day, count]) => ({ day, count }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Sozlamalar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Qayta aloqa oraliqlari va kunlik yuklama — kunlik lid sonini dastur shular
          asosida hisoblaydi
        </p>
      </div>

      <RecallSettingsForm
        rules={settings.rules}
        policy={settings.policy}
        operatorCount={operatorCount}
        dueToday={dueToday}
        forecast={forecast}
      />

      <PipelineStageManager stagesByPipeline={stagesByPipeline} />
    </div>
  );
}

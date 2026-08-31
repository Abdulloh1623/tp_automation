// Dinamik kanban bosqichlari — o'qish va pozitsion (keyingi/oldingi) yordamchilar.
// Yozish (create/rename/reorder/delete) `actions/pipeline-stages.ts`da —
// bu fayl "use server" emas, server komponentlar HAM shu yordamchilarni
// to'g'ridan-to'g'ri chaqiradi.
import { db } from "@/lib/db";
import { PIPELINE_ANCHORS, type Pipeline } from "@/lib/constants";

export type StageStep = {
  /** DB id — faqat haqiqiy (o'rtadagi) yozuvlarda bor; boshlanish/yakun ankorida yo'q. */
  id?: string;
  key: string;
  label: string;
  /** true — boshlanish/yakun ankor (DB'da saqlanmagan, faqat KOD'dagi qattiq qiymat). */
  fixed?: boolean;
};

/** Bitta pipeline'ning ORTADAGI (admin CRUD qiladigan) bosqichlari, tartib bo'yicha. */
export async function getMiddleStages(pipeline: Pipeline): Promise<StageStep[]> {
  const rows = await db.pipelineStage.findMany({
    where: { pipeline },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({ id: r.id, key: r.key, label: r.label }));
}

/** Barcha pipeline'lar uchun bir so'rovda — admin sozlamalar sahifasi uchun. */
export async function getAllMiddleStages(): Promise<Record<Pipeline, StageStep[]>> {
  const rows = await db.pipelineStage.findMany({ orderBy: { order: "asc" } });
  const byPipeline: Record<string, StageStep[]> = {};
  for (const r of rows) {
    (byPipeline[r.pipeline] ??= []).push({ id: r.id, key: r.key, label: r.label });
  }
  return byPipeline as Record<Pipeline, StageStep[]>;
}

/** Boshlanish → ortadagi bosqichlar → yakun — to'liq tartiblangan zanjir (UI/pozitsion mantiq uchun). */
export async function getFullChain(pipeline: Pipeline): Promise<StageStep[]> {
  const anchors = PIPELINE_ANCHORS[pipeline];
  const middle = await getMiddleStages(pipeline);
  return [
    { key: anchors.initialKey, label: anchors.initialLabel, fixed: true },
    ...middle,
    { key: anchors.terminalKey, label: anchors.terminalLabel, fixed: true },
  ];
}

export function getInitialKey(pipeline: Pipeline): string {
  return PIPELINE_ANCHORS[pipeline].initialKey;
}

export function getTerminalKey(pipeline: Pipeline): string {
  return PIPELINE_ANCHORS[pipeline].terminalKey;
}

/** Zanjirdagi keyingi kalit (yakundan keyin — null, ya'ni "endi faqat yakunlash qoladi"). */
export function nextKey(chain: StageStep[], current: string): string | null {
  const i = chain.findIndex((s) => s.key === current);
  if (i === -1 || i === chain.length - 1) return null;
  return chain[i + 1].key;
}

/** Zanjirdagi oldingi kalit (boshlanishdan oldin — null). */
export function prevKey(chain: StageStep[], current: string): string | null {
  const i = chain.findIndex((s) => s.key === current);
  if (i <= 0) return null;
  return chain[i - 1].key;
}

export function labelFor(chain: StageStep[], key: string): string {
  return chain.find((s) => s.key === key)?.label ?? key;
}

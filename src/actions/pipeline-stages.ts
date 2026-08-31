"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isPipeline, PIPELINE_LABELS, type Pipeline } from "@/lib/constants";

export type StageState = { ok: boolean; error?: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Ruxsat yo'q" };
  return { ok: true, userId: session.userId };
}

function revalidate() {
  revalidatePath("/sozlamalar");
  revalidatePath("/muammolar");
  revalidatePath("/vazifalarim");
}

/** Shu pipeline'da shu kalitda hozir nechta jonli (faol) yozuv bor. */
async function countLiveUsage(pipeline: Pipeline, key: string): Promise<number> {
  switch (pipeline) {
    case "MUAMMOLAR":
      return db.ticket.count({ where: { status: key, type: { not: "VERSION_UPDATE" } } });
    case "VERSIYA":
      return db.ticket.count({ where: { status: key, type: "VERSION_UPDATE" } });
    case "ESKALATSIYA":
      return db.client.count({ where: { escalationStageKey: key } });
    case "QAYTARISH":
      return db.equipmentReturnRequest.count({ where: { status: key } });
  }
}

/** Yangi ORTADAGI bosqich — ro'yxat oxiriga (yakundan oldin) qo'shiladi. */
export async function createStage(pipeline: string, label: string): Promise<StageState> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  if (!isPipeline(pipeline)) return { ok: false, error: "Noto'g'ri bo'lim" };

  const cleanLabel = (label ?? "").trim();
  if (!cleanLabel) return { ok: false, error: "Nom kiriting" };

  const last = await db.pipelineStage.findFirst({
    where: { pipeline },
    orderBy: { order: "desc" },
  });

  await db.pipelineStage.create({
    data: {
      pipeline,
      key: crypto.randomUUID(),
      label: cleanLabel,
      order: (last?.order ?? -1) + 1,
    },
  });
  await logAudit("Kanban bosqichi qo'shildi", {
    entity: "PipelineStage",
    detail: `${PIPELINE_LABELS[pipeline]} — ${cleanLabel}`,
  });
  revalidate();
  return { ok: true };
}

/** Bosqich nomini o'zgartirish — kalit (`key`) o'zgarmaydi, mavjud yozuvlar buzilmaydi. */
export async function renameStage(id: string, label: string): Promise<StageState> {
  const g = await requireAdmin();
  if (!g.ok) return g;

  const cleanLabel = (label ?? "").trim();
  if (!cleanLabel) return { ok: false, error: "Nom kiriting" };

  try {
    const stage = await db.pipelineStage.update({
      where: { id },
      data: { label: cleanLabel },
    });
    await logAudit("Kanban bosqichi nomi o'zgartirildi", {
      entity: "PipelineStage",
      detail: `${PIPELINE_LABELS[stage.pipeline as Pipeline] ?? stage.pipeline} — ${cleanLabel}`,
    });
  } catch {
    return { ok: false, error: "Bosqich topilmadi" };
  }
  revalidate();
  return { ok: true };
}

/** Qo'shni bosqich bilan tartibini almashtiradi ("↑"/"↓"). */
export async function reorderStage(
  id: string,
  direction: "up" | "down",
): Promise<StageState> {
  const g = await requireAdmin();
  if (!g.ok) return g;

  const stage = await db.pipelineStage.findUnique({ where: { id } });
  if (!stage) return { ok: false, error: "Bosqich topilmadi" };

  const siblings = await db.pipelineStage.findMany({
    where: { pipeline: stage.pipeline },
    orderBy: { order: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return { ok: true }; // chetda — jim o'tkazamiz

  const other = siblings[swapIdx];
  await db.$transaction([
    db.pipelineStage.update({ where: { id: stage.id }, data: { order: other.order } }),
    db.pipelineStage.update({ where: { id: other.id }, data: { order: stage.order } }),
  ]);
  revalidate();
  return { ok: true };
}

/**
 * Bosqichni o'chirish — ikki himoya bilan:
 * 1) Shu bosqichda hozir jonli yozuv bo'lsa — bloklanadi (avval boshqa
 *    bosqichga ko'chirilishi kerak).
 * 2) Pipeline'ning YAGONA qolgan ortadagi bosqichi bo'lsa — bloklanadi
 *    (boshlanish va yakun orasida kamida bitta ish-bosqichi doim bo'lishi
 *    shart, aks holda yangi vazifa to'g'ridan-to'g'ri yakunga "sirg'alib
 *    tushardi").
 */
export async function deleteStage(id: string): Promise<StageState> {
  const g = await requireAdmin();
  if (!g.ok) return g;

  const stage = await db.pipelineStage.findUnique({ where: { id } });
  if (!stage) return { ok: false, error: "Bosqich topilmadi" };
  if (!isPipeline(stage.pipeline)) return { ok: false, error: "Noto'g'ri bo'lim" };

  const siblingCount = await db.pipelineStage.count({ where: { pipeline: stage.pipeline } });
  if (siblingCount <= 1) {
    return {
      ok: false,
      error: "Bu — bo'limning yagona bosqichi. Kamida bittasi qolishi shart.",
    };
  }

  const inUse = await countLiveUsage(stage.pipeline, stage.key);
  if (inUse > 0) {
    return {
      ok: false,
      error: `${inUse} ta faol vazifa shu bosqichda — avval ularni boshqa bosqichga ko'chiring.`,
    };
  }

  await db.pipelineStage.delete({ where: { id } });
  await logAudit("Kanban bosqichi o'chirildi", {
    entity: "PipelineStage",
    detail: `${PIPELINE_LABELS[stage.pipeline]} — ${stage.label}`,
  });
  revalidate();
  return { ok: true };
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowUp, ArrowDown, Pencil, Trash2, Check, X } from "lucide-react";
import {
  createStage,
  renameStage,
  reorderStage,
  deleteStage,
} from "@/actions/pipeline-stages";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PIPELINES, PIPELINE_LABELS, PIPELINE_ANCHORS, type Pipeline } from "@/lib/constants";

type Stage = { id?: string; key: string; label: string };

/** Bitta pipeline'ning ortadagi bosqichlar ro'yxati — qo'shish/nom/tartib/o'chirish. */
function StageList({ pipeline, stages }: { pipeline: Pipeline; stages: Stage[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    start(async () => {
      const res = await action();
      if (res.ok) {
        if (okMsg) toast(okMsg, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  async function onDelete(stage: Stage) {
    if (!stage.id) return;
    const ok = await confirmDialog({
      title: `"${stage.label}" bosqichi o'chirilsinmi?`,
      confirmLabel: "O'chirish",
    });
    if (ok) run(() => deleteStage(stage.id!), "Bosqich o'chirildi");
  }

  const anchors = PIPELINE_ANCHORS[pipeline];

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        Boshlanish: <span className="font-medium">{anchors.initialLabel}</span> (o'zgarmas)
      </div>

      {stages.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
        >
          {editingId === s.id ? (
            <>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="h-8 flex-1 text-sm"
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={pending || !editLabel.trim()}
                onClick={() => {
                  run(() => renameStage(s.id!, editLabel));
                  setEditingId(null);
                }}
              >
                <Check className="h-4 w-4 text-emerald-600" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                {s.label}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                disabled={pending}
                onClick={() => run(() => reorderStage(s.id!, "up"))}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                disabled={pending}
                onClick={() => run(() => reorderStage(s.id!, "down"))}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                disabled={pending}
                onClick={() => {
                  setEditingId(s.id!);
                  setEditLabel(s.label);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-600 dark:text-red-400"
                disabled={pending}
                onClick={() => onDelete(s)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        Yakun: <span className="font-medium">{anchors.terminalLabel}</span> (o'zgarmas)
      </div>

      {adding ? (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Yangi bosqich nomi"
            className="h-8 flex-1 text-sm"
            autoFocus
          />
          <Button
            size="sm"
            disabled={pending || !newLabel.trim()}
            onClick={() => {
              run(() => createStage(pipeline, newLabel), "Bosqich qo'shildi");
              setNewLabel("");
              setAdding(false);
            }}
          >
            Qo'shish
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Bekor
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-1"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Yangi bosqich
        </Button>
      )}
    </div>
  );
}

export function PipelineStageManager({
  stagesByPipeline,
}: {
  stagesByPipeline: Record<Pipeline, Stage[]>;
}) {
  const [active, setActive] = useState<Pipeline>(PIPELINES[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kanban bosqichlari</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Har bo'limning boshlanish/yakun bosqichi o'zgarmas — orasidagi
          ish-bosqichlarini qo'shing, nomini o'zgartiring, tartibini
          almashtiring yoki o'chiring. Bosqichda faol vazifa bo'lsa, u
          o'chirilmaydi.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {PIPELINES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActive(p)}
              className={
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors " +
                (active === p
                  ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              {PIPELINE_LABELS[p]}
            </button>
          ))}
        </div>
        <StageList pipeline={active} stages={stagesByPipeline[active] ?? []} />
      </CardContent>
    </Card>
  );
}

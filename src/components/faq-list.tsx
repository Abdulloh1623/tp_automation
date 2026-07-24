"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  ChevronDown,
  Pencil,
  Trash2,
  HelpCircle,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FaqForm, type FaqInitial } from "@/components/faq-form";
import { MarkdownView, stripMarkdown } from "@/lib/markdown";
import { deleteFaq } from "@/actions/faq";
import { toast } from "@/components/toaster";
import { confirmDialog } from "@/components/confirm-dialog";

export type FaqItem = {
  id: string;
  question: string;
  details: string | null;
  solution: string;
  authorName: string | null;
  createdAtFmt: string;
  edited: boolean;
};

export function FaqList({
  items,
  isAdmin,
  canCreate,
}: {
  items: FaqItem[];
  isAdmin: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((f) =>
      `${f.question} ${stripMarkdown(f.details)} ${stripMarkdown(f.solution)}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  function remove(f: FaqItem) {
    void (async () => {
      const ok = await confirmDialog({
        title: "FAQ o'chirilsinmi?",
        message: f.question,
        confirmLabel: "O'chirish",
      });
      if (!ok) return;
      start(async () => {
        const res = await deleteFaq(f.id);
        if (res.ok) {
          toast("O'chirildi", "success");
          router.refresh();
        } else {
          toast(res.error || "Xatolik", "error");
        }
      });
    })();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Savol yoki yechim bo'yicha qidirish…"
            className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
          />
        </div>
        {canCreate && !creating && (
          <Button onClick={() => { setCreating(true); setEditId(null); }}>
            <Plus className="h-4 w-4" />
            Yangi savol
          </Button>
        )}
      </div>

      {creating && (
        <FaqForm
          mode="create"
          onDone={() => setCreating(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500 dark:text-slate-400">
            {query
              ? "Qidiruv bo'yicha hech narsa topilmadi."
              : "Hozircha savol yo'q — birinchi bo'lib qo'shing."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((f) => {
            const open = openId === f.id;
            const editing = editId === f.id;
            if (editing) {
              return (
                <FaqForm
                  key={f.id}
                  mode="edit"
                  initial={f as FaqInitial}
                  onDone={() => setEditId(null)}
                  onSaved={() => router.refresh()}
                />
              );
            }
            return (
              <Card key={f.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : f.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <HelpCircle className="h-5 w-5 shrink-0 text-primary-500" />
                  <span className="flex-1 font-medium text-slate-900 dark:text-slate-100">
                    {f.question}
                  </span>
                  <ChevronDown
                    className={
                      "h-5 w-5 shrink-0 text-slate-400 transition-transform " +
                      (open ? "rotate-180" : "")
                    }
                  />
                </button>

                {open && (
                  <CardContent className="space-y-3 border-t border-slate-100 dark:border-slate-800 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                    {f.details && (
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          Muammo
                        </div>
                        <MarkdownView text={f.details} />
                      </div>
                    )}
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Yechim
                      </div>
                      <MarkdownView text={f.solution} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <UserIcon className="h-3.5 w-3.5" />
                        {f.authorName ?? "Noma'lum"} · {f.createdAtFmt}
                        {f.edited && " · tahrirlangan"}
                      </span>
                      {isAdmin && (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditId(f.id); setCreating(false); }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3 w-3" />
                            Tahrir
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => remove(f)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-900 px-2 py-1 font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            O'chirish
                          </button>
                        </span>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

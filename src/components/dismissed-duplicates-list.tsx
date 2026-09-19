"use client";

// Oldin "dublikat emas" deb belgilangan juftliklar — bekor qilish (undo)
// uchun. Xatolashib bosilgan tugmani tuzatish imkonini beradi. Standart
// holatda yopiq (soni ko'p bo'lmasa ham asosiy ro'yxatni bosmasin).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientLink } from "@/components/client-link";
import { undoDismissDuplicate } from "@/actions/duplicates";
import { toast } from "@/components/toaster";
import { formatDateTime } from "@/lib/utils";
import type { DismissedDuplicateRow } from "@/lib/duplicates-data";

function clientLabel(c: { restaurantName: string; fullName: string } | null): string {
  if (!c) return "o'chirilgan yozuv";
  return c.restaurantName || c.fullName || "—";
}

export function DismissedDuplicatesList({ rows }: { rows: DismissedDuplicateRow[] }) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  if (rows.length === 0) return null;

  function onUndo(id: string) {
    setPendingId(id);
    start(async () => {
      const res = await undoDismissDuplicate(id);
      setPendingId(null);
      if (res.ok) {
        toast("Bekor qilindi — guruh qayta ko'rinishi mumkin", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <span>Dublikat emas deb belgilangan juftliklar ({rows.length})</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open && (
          <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
              >
                <div className="min-w-[260px] flex-1 text-slate-600 dark:text-slate-300">
                  {r.clientA ? (
                    <ClientLink id={r.clientA.id} name={clientLabel(r.clientA)} />
                  ) : (
                    clientLabel(r.clientA)
                  )}
                  <span className="mx-1.5 text-slate-400">↔</span>
                  {r.clientB ? (
                    <ClientLink id={r.clientB.id} name={clientLabel(r.clientB)} />
                  ) : (
                    clientLabel(r.clientB)
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {r.dismissedByName ?? "—"} · {formatDateTime(r.createdAt)}
                </div>
                <button
                  type="button"
                  onClick={() => onUndo(r.id)}
                  disabled={pendingId === r.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  {pendingId === r.id ? "..." : "Qaytarish"}
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

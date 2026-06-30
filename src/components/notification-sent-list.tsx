"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Eye } from "lucide-react";
import { deleteNotification } from "@/actions/notifications";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type SentItem = {
  id: string;
  title: string;
  body: string;
  audienceLabel: string;
  priority: string;
  createdAt: string;
  total: number;
  read: number;
};

export function NotificationSentList({ items }: { items: SentItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function remove(id: string, title: string) {
    const ok = await confirmDialog({
      title: "Bildirishnomani o'chirish",
      message: `"${title}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.`,
      confirmLabel: "O'chirish",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteNotification(id);
      if (res.ok) {
        toast("O'chirildi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yuborilgan bildirishnomalar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {n.priority === "IMPORTANT" && (
                  <span className="rounded bg-red-100 dark:bg-red-950/50 px-1.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                    Muhim
                  </span>
                )}
                <span className="font-medium text-slate-900 dark:text-slate-100">{n.title}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{n.body}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400 dark:text-slate-500">
                <span>{n.audienceLabel}</span>
                <span>· {n.createdAt}</span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {n.read}/{n.total} o'qidi
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-red-600 dark:text-red-400"
              onClick={() => remove(n.id, n.title)}
              disabled={pending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

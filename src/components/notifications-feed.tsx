"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Check } from "lucide-react";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/actions/notifications";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type FeedItem = {
  id: string;
  title: string;
  body: string;
  priority: string;
  createdAt: string;
  fromName: string;
  read: boolean;
};

export function NotificationsFeed({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const unread = items.filter((i) => !i.read).length;

  function markOne(id: string) {
    start(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }
  function markAll() {
    start(async () => {
      await markAllNotificationsRead();
      toast("Hammasi o'qildi", "success");
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Bildirishnoma yo'q</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">{unread} ta o'qilmagan</span>
          <Button variant="outline" size="sm" onClick={markAll} disabled={pending}>
            <CheckCheck className="h-4 w-4" /> Hammasini o'qildi
          </Button>
        </div>
      )}

      {items.map((n) => (
        <Card
          key={n.id}
          className={
            "p-4 " +
            (n.read
              ? ""
              : "border-blue-200 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20")
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                {n.priority === "IMPORTANT" && (
                  <span className="rounded bg-red-100 dark:bg-red-950/50 px-1.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                    Muhim
                  </span>
                )}
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</h3>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{n.body}</p>
              <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {n.fromName} · {n.createdAt}
              </div>
            </div>
            {!n.read && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => markOne(n.id)}
                disabled={pending}
                title="O'qildi deb belgilash"
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

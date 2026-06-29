"use client";

import { useTransition } from "react";
import { Bell } from "lucide-react";
import { sendRemindersNow } from "@/actions/reminders";
import { toast } from "@/components/toaster";

export function ReminderButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await sendRemindersNow({}, new FormData());
          if (res.ok) toast(res.message ?? "Eslatmalar yuborildi", "success");
          else toast(res.error ?? "Xatolik", "error");
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
    >
      <Bell className="h-4 w-4" />
      {pending ? "Yuborilmoqda..." : "Eslatma yuborish"}
    </button>
  );
}

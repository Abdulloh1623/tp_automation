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
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
    >
      <Bell className="h-4 w-4" />
      {pending ? "Yuborilmoqda..." : "Eslatma yuborish"}
    </button>
  );
}

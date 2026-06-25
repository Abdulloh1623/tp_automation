"use client";

import { useTransition } from "react";
import { Shuffle } from "lucide-react";
import { redistributeLeads } from "@/actions/distribution";
import { toast } from "@/components/toaster";

export function DistributeButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await redistributeLeads();
          if (res.ok) {
            toast(`${res.assigned} mijoz ${res.operators} operatorga taqsimlandi`, "success");
          } else {
            toast(res.error ?? "Xatolik", "error");
          }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
    >
      <Shuffle className="h-4 w-4" />
      {pending ? "Taqsimlanmoqda..." : "Bugun qayta taqsimla"}
    </button>
  );
}

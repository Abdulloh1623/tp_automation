"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Check, X } from "lucide-react";
import { approvePasswordReset, rejectPasswordReset } from "@/actions/password-reset";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ResetRequestRow = {
  id: string;
  userName: string;
  username: string;
  roleLabel: string;
  note: string | null;
  requestedAt: string;
};

export function PasswordResetRequests({ requests }: { requests: ResetRequestRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast(okMsg, "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  if (requests.length === 0) return null;

  return (
    <Card className="border-amber-200 dark:border-amber-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-500" />
          Parol tiklash so'rovlari
          <span className="rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {requests.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {r.userName}{" "}
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  ({r.roleLabel} · {r.username})
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {r.requestedAt}
                {r.note ? ` · ${r.note}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => act(() => approvePasswordReset(r.id), "Tasdiqlandi — yangi parol kuchga kirdi")}
                disabled={pending}
              >
                <Check className="h-3.5 w-3.5" /> Tasdiqlash
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400"
                onClick={() => act(() => rejectPasswordReset(r.id), "Rad etildi")}
                disabled={pending}
              >
                <X className="h-3.5 w-3.5" /> Rad etish
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

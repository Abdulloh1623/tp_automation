"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { updateUstaStatus } from "@/actions/usta";
import { Button } from "@/components/ui/button";
import { USTA_ACTION_STATUSES, ustaStatusLabel } from "@/lib/constants";

/** Boshliq usta nomidan vazifa holatini yangilaydi (ustalar tizimga kirmaydi). */
export function UstaStatusControl({
  clientId,
  current,
}: {
  clientId: string;
  current: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(status: string) {
    setErr(null);
    start(async () => {
      const res = await updateUstaStatus(clientId, status);
      if (res.ok) router.refresh();
      else setErr(res.error ?? "Xatolik");
    });
  }

  return (
    <div className="space-y-1.5">
      {err && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {err}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {USTA_ACTION_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={current === s ? undefined : "outline"}
            disabled={pending}
            className="h-7 px-2 text-xs"
            onClick={() => run(s)}
          >
            {ustaStatusLabel(s)}
          </Button>
        ))}
      </div>
    </div>
  );
}

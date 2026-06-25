"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, AlertCircle } from "lucide-react";
import { assignUsta } from "@/actions/usta";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseRegions } from "@/lib/constants";

type Usta = { id: string; name: string; region: string | null; regions: string | null };

export function AssignUstaForm({
  clientId,
  ustalar,
  suggestedUstaId,
}: {
  clientId: string;
  ustalar: Usta[];
  suggestedUstaId: string | null;
}) {
  const [ustaId, setUstaId] = useState(
    suggestedUstaId ?? ustalar[0]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    if (!ustaId) {
      setError("Usta tanlang");
      return;
    }
    setError(null);
    start(async () => {
      const res = await assignUsta(clientId, ustaId, note);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Xatolik");
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs text-slate-500">Usta</label>
          <Select
            value={ustaId}
            onChange={(e) => setUstaId(e.target.value)}
            className="h-9"
          >
            {ustalar.length === 0 && <option value="">Usta yo'q</option>}
            {ustalar.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {parseRegions(u.regions, u.region).length
                  ? ` — ${parseRegions(u.regions, u.region).join(", ")}`
                  : ""}
                {u.id === suggestedUstaId ? " (taklif)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ustaga izoh (ixtiyoriy)"
          className="h-9 min-w-[180px] flex-1"
        />
        <Button onClick={submit} disabled={pending} size="sm">
          <UserCheck className="h-4 w-4" />
          {pending ? "..." : "Biriktirish"}
        </Button>
      </div>
    </div>
  );
}

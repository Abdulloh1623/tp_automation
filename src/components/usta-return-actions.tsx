"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, PackageCheck } from "lucide-react";
import { startReturnProgress, confirmReturnCollected } from "@/actions/equipment";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";

/** Usta o'zi: qaytarish arizasini "Jarayonda"ga o'tkazadi / "Olib kelindi" deb yakunlaydi. */
export function UstaReturnActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
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

  async function onStart() {
    const { ok, note } = await confirmWithNote({
      title: "Yo'lga chiqdim",
      confirmLabel: "Boshladim",
      variant: "primary",
      note: { label: "Izoh", placeholder: "Masalan: mijozga qo'ng'iroq qildim", required: true },
    });
    if (ok) run(() => startReturnProgress(requestId, note), "Jarayonga o'tkazildi");
  }

  async function onDone() {
    const { ok, note } = await confirmWithNote({
      title: "Uskuna olib kelindi",
      confirmLabel: "Yakunlash",
      variant: "primary",
      note: { label: "Izoh (uskuna holati)", placeholder: "Masalan: yaxshi holatda", required: true },
    });
    if (ok) run(() => confirmReturnCollected(requestId, note), "Ariza yakunlandi");
  }

  if (status === "APPROVED") {
    return (
      <Button type="button" size="sm" disabled={pending} onClick={onStart}>
        <Truck className="h-3.5 w-3.5" /> Yo'lga chiqdim
      </Button>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <Button type="button" size="sm" disabled={pending} onClick={onDone}>
        <PackageCheck className="h-3.5 w-3.5" /> Uskuna olib kelindi
      </Button>
    );
  }
  return null;
}

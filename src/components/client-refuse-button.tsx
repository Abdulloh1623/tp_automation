"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, X, AlertCircle } from "lucide-react";
import { refuseClient } from "@/actions/clients";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Mijoz kartochkasidagi "Otkaz" tugmasi — mijozni xizmatdan voz kechgan deb
 * belgilaydi. Sabab (izoh) MAJBURIY. ISTAGAN xodim bosishi mumkin (server
 * action egalik tekshiruvidan istisno). Allaqachon otkazda bo'lsa ko'rinmaydi.
 */
export function ClientRefuseButton({
  clientId,
  restaurantName,
}: {
  clientId: string;
  restaurantName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("Otkaz uchun izoh (sabab) majburiy");
      return;
    }
    start(async () => {
      const res = await refuseClient(clientId, reason);
      if (res.ok) {
        setOpen(false);
        setReason("");
        toast("Mijoz otkaz qilindi", "success");
        router.refresh();
      } else {
        setError(res.error ?? "Xatolik");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-4 w-4" /> Otkaz
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-rose-700 dark:text-rose-300">
                <Ban className="h-4 w-4" /> Otkaz — {restaurantName}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600"
                disabled={pending}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Mijoz xizmatdan voz kechgan deb belgilanadi va kunlik ish
              ro'yxatidan chiqariladi. Keyinchalik boshliq uni qaytarishi mumkin.
            </p>

            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div>
              <Label>Sabab (majburiy)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="masalan: narx qimmat, boshqa tizimga o'tdi…"
                className="min-h-[80px]"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={submit}
                disabled={pending || !reason.trim()}
              >
                <Ban className="h-4 w-4" />
                {pending ? "Saqlanmoqda..." : "Otkaz qilish"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Bekor
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

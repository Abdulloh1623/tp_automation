"use client";

// Mijoz profilidagi dastur versiyasi — bosilganda kichik palitra ochiladi
// (v0..v4 tanlash), tanlash zahoti saqlanadi. Faqat SHU YERDA (profilda)
// tahrirlanadi; boshqa hamma joyda (mijozlar ro'yxati, kunlik lid) faqat
// o'qish uchun `ClientAppVersionBadge` ishlatiladi.

import { useState, useTransition } from "react";
import { setClientAppVersion } from "@/actions/clients";
import { toast } from "@/components/toaster";
import { ClientAppVersionBadge } from "@/components/status-badge";
import { CLIENT_APP_VERSIONS, clientAppVersionLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ClientVersionPicker({
  clientId,
  version: initial,
}: {
  clientId: string;
  version: string | null;
}) {
  const [version, setVersion] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function pick(v: string) {
    if (v === version) return setOpen(false);
    start(async () => {
      const res = await setClientAppVersion(clientId, v);
      if (res.ok) {
        setVersion(v);
        setOpen(false);
        toast(`Dastur versiyasi: ${clientAppVersionLabel(v)}`, "success");
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Dastur versiyasini belgilash"
        className="cursor-pointer transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full"
      >
        <ClientAppVersionBadge version={version} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1.5 flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-lg">
            {CLIENT_APP_VERSIONS.map((v) => (
              <button
                key={v}
                type="button"
                disabled={pending}
                onClick={() => pick(v)}
                className={cn(
                  "rounded-full transition hover:scale-110",
                  v === version && "ring-2 ring-primary-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900",
                )}
              >
                <ClientAppVersionBadge version={v} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

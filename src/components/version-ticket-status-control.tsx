"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveVersionTicket, setTicketStatus } from "@/actions/tickets";
import { confirmWithNote } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CLIENT_APP_VERSIONS, clientAppVersionLabel } from "@/lib/constants";

/**
 * "Yangi versiya" so'rovlari uchun yakunlash boshqaruvi — umumiy
 * `TicketStatusControl`dan farqli, erkin izoh o'rniga mijozga o'rnatilgan
 * ANIQ versiyani so'raydi (tanlangach `Client.appVersion` ham yangilanadi).
 */
export function VersionTicketStatusControl({
  ticketId,
  status,
}: {
  ticketId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [version, setVersion] = useState("");

  function resolve() {
    start(async () => {
      const res = await resolveVersionTicket(ticketId, version);
      if (res.ok) {
        toast(`Versiya yangilandi: ${clientAppVersionLabel(version)}`, "success");
        setVersion("");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  async function onReopen() {
    const { ok, note } = await confirmWithNote({
      title: "Muammoni qayta ochish",
      confirmLabel: "Qayta ochish",
      note: { label: "Nima uchun qayta ochilmoqda", required: true },
    });
    if (!ok) return;
    start(async () => {
      const fd = new FormData();
      fd.set("resolutionNote", note);
      const res = await setTicketStatus(ticketId, "OPEN", fd);
      if (res.ok) {
        toast("Muammo qayta ochildi", "success");
        router.refresh();
      } else {
        toast(res.error ?? "Xatolik", "error");
      }
    });
  }

  if (status === "RESOLVED") {
    return (
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onReopen}>
        Qayta ochish
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        className="h-8 w-40 text-xs"
      >
        <option value="">Yangi versiya…</option>
        {CLIENT_APP_VERSIONS.map((v) => (
          <option key={v} value={v}>
            {clientAppVersionLabel(v)}
          </option>
        ))}
      </Select>
      <Button type="button" size="sm" disabled={pending || !version} onClick={resolve}>
        Versiya yangilandi
      </Button>
    </div>
  );
}

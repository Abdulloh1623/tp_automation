import { Phone, HardHat, Inbox, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { TicketStatusBadge, TicketPriorityBadge, TicketTypeBadge } from "@/components/status-badge";
import { TicketStatusControl } from "@/components/ticket-status-control";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
import { PhoneCopyButton } from "@/components/phone-copy";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";

const RESOLVED_RENDER_CAP = 30;

const PRIORITY_ACCENT: Record<string, string> = {
  HIGH: "border-l-red-400 dark:border-l-red-500",
  MEDIUM: "border-l-amber-300 dark:border-l-amber-500",
  LOW: "border-l-slate-200 dark:border-l-slate-700",
};

export default async function VazifalarimPage() {
  const session = await requireRole(["INSTALLER"]);

  const tickets = await db.ticket.findMany({
    where: { assignedUstaId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      client: {
        select: { id: true, restaurantName: true, fullName: true, phone: true, region: true },
      },
    },
  });

  const faol = tickets.filter((t) => t.status !== "RESOLVED");
  const hal = tickets.filter((t) => t.status === "RESOLVED");

  function ticketCard(t: (typeof tickets)[number]) {
    return (
      <Card
        key={t.id}
        className={`border-l-4 p-4 ${PRIORITY_ACCENT[t.priority] ?? PRIORITY_ACCENT.LOW}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {t.client.restaurantName}
              {t.client.fullName && <span className="text-slate-400 dark:text-slate-500"> · {t.client.fullName}</span>}
              {t.client.region && <span className="text-slate-400 dark:text-slate-500"> · {t.client.region}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TicketTypeBadge type={t.type} />
            <TicketPriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          <span>Ochilgan: {formatDate(t.createdAt)}</span>
          {t.status === "RESOLVED" && t.resolvedAt && (
            <span>· Hal qilindi: {formatDate(t.resolvedAt)}</span>
          )}
          <span className="inline-flex items-center gap-1">
            ·
            <a
              href={`tel:${normalizePhone(t.client.phone)}`}
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
            >
              <Phone className="h-3 w-3" />
              {formatPhone(t.client.phone)}
            </a>
            <PhoneCopyButton phone={t.client.phone} />
          </span>
        </div>

        {t.ustaNote && (
          <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <span className="font-medium">Izoh:</span> {t.ustaNote}
          </div>
        )}

        {t.resolutionNote && (
          <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            Yechim: {t.resolutionNote}
          </div>
        )}

        <div className="mt-3">
          <TicketStatusControl ticketId={t.id} status={t.status} />
        </div>
      </Card>
    );
  }

  function panel(items: typeof tickets, emptyHint: string, resolved = false) {
    if (items.length === 0) {
      return (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {emptyHint}
        </p>
      );
    }
    const shown = resolved ? items.slice(0, RESOLVED_RENDER_CAP) : items;
    return (
      <div className="space-y-3">
        {shown.map(ticketCard)}
        {resolved && items.length > RESOLVED_RENDER_CAP && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Yana {items.length - RESOLVED_RENDER_CAP} ta hal qilingan muammo
          </p>
        )}
      </div>
    );
  }

  const tabs: TicketTab[] = [
    {
      key: "faol",
      label: "Faol",
      icon: <Inbox className="h-4 w-4" />,
      tone: "red",
      count: faol.length,
      content: panel(faol, "Sizga biriktirilgan faol muammo yo'q."),
    },
    {
      key: "hal",
      label: "Hal qilingan",
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "emerald",
      count: hal.length,
      content: panel(hal, "Hal qilingan muammo yo'q.", true),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Vazifalarim</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sizga biriktirilgan muammolar
        </p>
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={HardHat} title="Sizga hali muammo biriktirilmagan" />
      ) : (
        <TicketTabs tabs={tabs} initialKey="faol" />
      )}
    </div>
  );
}

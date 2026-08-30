import {
  Phone,
  HardHat,
  AlertTriangle,
  PackageCheck,
  DownloadCloud,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketTypeBadge,
} from "@/components/status-badge";
import { UstaStatusControl } from "@/components/usta-status-control";
import { UstaReturnActions } from "@/components/usta-return-actions";
import { VersionTicketStatusControl } from "@/components/version-ticket-status-control";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
import { PhoneCopyButton } from "@/components/phone-copy";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";

const RESOLVED_RENDER_CAP = 20;

/** Bir mijoz kartasi — ustaning har uch bo'limida bir xil qobiq. */
function ClientCard({
  restaurantName,
  fullName,
  region,
  phone,
  badges,
  note,
  children,
}: {
  restaurantName: string;
  fullName: string;
  region: string | null;
  phone: string;
  badges?: React.ReactNode;
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            {restaurantName}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {fullName}
            {region && (
              <span className="text-slate-400 dark:text-slate-500">
                {" "}
                · {region}
              </span>
            )}
          </div>
        </div>
        {badges && (
          <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
        )}
      </div>
      <div className="mt-2 inline-flex items-center gap-1 text-sm">
        <a
          href={`tel:${normalizePhone(phone)}`}
          className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
        >
          <Phone className="h-3.5 w-3.5" />
          {formatPhone(phone)}
        </a>
        <PhoneCopyButton phone={phone} />
      </div>
      {note && (
        <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          {note}
        </div>
      )}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function panel(items: React.ReactNode[], emptyHint: string) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500">
        {emptyHint}
      </p>
    );
  }
  return <div className="space-y-3">{items}</div>;
}

export default async function VazifalarimPage() {
  const session = await requireRole(["INSTALLER"]);
  const ustaId = session.userId;

  const [
    escalatedActive,
    escalatedDone,
    returnsActive,
    returnsDone,
    ticketsActive,
    ticketsDone,
  ] = await Promise.all([
    db.client.findMany({
      where: { assignedUstaId: ustaId, stage: "FORWARDED" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        restaurantName: true,
        fullName: true,
        phone: true,
        region: true,
        ustaStatus: true,
        specialNote: true,
      },
    }),
    db.client.findMany({
      where: { assignedUstaId: ustaId, stage: "RESOLVED", ustaStatus: "DONE" },
      orderBy: { updatedAt: "desc" },
      take: RESOLVED_RENDER_CAP,
      select: {
        id: true,
        restaurantName: true,
        fullName: true,
        phone: true,
        region: true,
        updatedAt: true,
      },
    }),
    db.equipmentReturnRequest.findMany({
      where: { ustaId, status: { in: ["APPROVED", "IN_PROGRESS"] } },
      orderBy: { createdAt: "asc" },
      include: {
        client: {
          select: {
            restaurantName: true,
            fullName: true,
            phone: true,
            region: true,
          },
        },
      },
    }),
    db.equipmentReturnRequest.findMany({
      where: { ustaId, status: "DONE" },
      orderBy: { resolvedAt: "desc" },
      take: RESOLVED_RENDER_CAP,
      include: {
        client: {
          select: {
            restaurantName: true,
            fullName: true,
            phone: true,
            region: true,
          },
        },
      },
    }),
    db.ticket.findMany({
      where: {
        assignedUstaId: ustaId,
        type: "VERSION_UPDATE",
        status: { not: "RESOLVED" },
      },
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            restaurantName: true,
            fullName: true,
            phone: true,
            region: true,
          },
        },
      },
    }),
    db.ticket.findMany({
      where: {
        assignedUstaId: ustaId,
        type: "VERSION_UPDATE",
        status: "RESOLVED",
      },
      orderBy: { resolvedAt: "desc" },
      take: RESOLVED_RENDER_CAP,
      include: {
        client: {
          select: {
            restaurantName: true,
            fullName: true,
            phone: true,
            region: true,
          },
        },
      },
    }),
  ]);

  // --- Eskalatsiya ---
  const escalationTab = panel(
    [
      ...escalatedActive.map((c) => (
        <ClientCard
          key={c.id}
          restaurantName={c.restaurantName}
          fullName={c.fullName}
          region={c.region}
          phone={c.phone}
          note={c.specialNote}
          badges={<Badge tone="amber">Jarayonda</Badge>}
        >
          <UstaStatusControl clientId={c.id} current={c.ustaStatus} />
        </ClientCard>
      )),
    ],
    "Sizga biriktirilgan eskalatsiya yo'q.",
  );
  const escalationDoneTab = panel(
    escalatedDone.map((c) => (
      <ClientCard
        key={c.id}
        restaurantName={c.restaurantName}
        fullName={c.fullName}
        region={c.region}
        phone={c.phone}
        badges={
          <Badge tone="green">Yakunlangan · {formatDate(c.updatedAt)}</Badge>
        }
      >
        <span />
      </ClientCard>
    )),
    "Yakunlangan eskalatsiya yo'q.",
  );

  // --- Qaytarish ---
  const returnStatusTone: Record<string, "amber" | "blue"> = {
    APPROVED: "amber",
    IN_PROGRESS: "blue",
  };
  const returnStatusLabel: Record<string, string> = {
    APPROVED: "Biriktirilgan",
    IN_PROGRESS: "Yo'lda",
  };
  const returnTab = panel(
    returnsActive.map((r) => (
      <ClientCard
        key={r.id}
        restaurantName={r.client.restaurantName}
        fullName={r.client.fullName}
        region={r.client.region}
        phone={r.client.phone}
        note={r.note}
        badges={
          <Badge tone={returnStatusTone[r.status] ?? "slate"}>
            {returnStatusLabel[r.status] ?? r.status}
          </Badge>
        }
      >
        <UstaReturnActions requestId={r.id} status={r.status} />
      </ClientCard>
    )),
    "Sizga biriktirilgan qaytarish arizasi yo'q.",
  );
  const returnDoneTab = panel(
    returnsDone.map((r) => (
      <ClientCard
        key={r.id}
        restaurantName={r.client.restaurantName}
        fullName={r.client.fullName}
        region={r.client.region}
        phone={r.client.phone}
        note={r.resolutionNote}
        badges={
          <Badge tone="green">
            Yakunlangan{r.resolvedAt ? ` · ${formatDate(r.resolvedAt)}` : ""}
          </Badge>
        }
      >
        <span />
      </ClientCard>
    )),
    "Yakunlangan qaytarish yo'q.",
  );

  // --- Yangi versiya ---
  const versionTab = panel(
    ticketsActive.map((t) => (
      <ClientCard
        key={t.id}
        restaurantName={t.client.restaurantName}
        fullName={t.client.fullName}
        region={t.client.region}
        phone={t.client.phone}
        note={t.ustaNote}
        badges={
          <>
            <TicketTypeBadge type={t.type} />
            <TicketPriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </>
        }
      >
        <VersionTicketStatusControl ticketId={t.id} status={t.status} />
      </ClientCard>
    )),
    "Sizga biriktirilgan versiya so'rovi yo'q.",
  );
  const versionDoneTab = panel(
    ticketsDone.map((t) => (
      <ClientCard
        key={t.id}
        restaurantName={t.client.restaurantName}
        fullName={t.client.fullName}
        region={t.client.region}
        phone={t.client.phone}
        note={t.resolutionNote}
        badges={
          <Badge tone="green">
            Yakunlangan{t.resolvedAt ? ` · ${formatDate(t.resolvedAt)}` : ""}
          </Badge>
        }
      >
        <span />
      </ClientCard>
    )),
    "Yakunlangan versiya so'rovi yo'q.",
  );

  const tabs: TicketTab[] = [
    {
      key: "eskalatsiya",
      label: "Eskalatsiya",
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: "amber",
      count: escalatedActive.length,
      content: (
        <div className="space-y-5">
          {escalationTab}
          {escalatedDone.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Yakunlangan
              </h3>
              {escalationDoneTab}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "qaytarish",
      label: "Qaytarish",
      icon: <PackageCheck className="h-4 w-4" />,
      tone: "sky",
      count: returnsActive.length,
      content: (
        <div className="space-y-5">
          {returnTab}
          {returnsDone.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Yakunlangan
              </h3>
              {returnDoneTab}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "versiya",
      label: "Yangi versiya",
      icon: <DownloadCloud className="h-4 w-4" />,
      tone: "red",
      count: ticketsActive.length,
      content: (
        <div className="space-y-5">
          {versionTab}
          {ticketsDone.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Yakunlangan
              </h3>
              {versionDoneTab}
            </div>
          )}
        </div>
      ),
    },
  ];

  const totalActive =
    escalatedActive.length + returnsActive.length + ticketsActive.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Vazifalarim
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sizga biriktirilgan eskalatsiya, qaytarish va versiya so'rovlari
        </p>
      </div>

      {totalActive === 0 &&
      escalatedDone.length === 0 &&
      returnsDone.length === 0 &&
      ticketsDone.length === 0 ? (
        <EmptyState icon={HardHat} title="Sizga hali vazifa biriktirilmagan" />
      ) : (
        <TicketTabs tabs={tabs} initialKey="eskalatsiya" />
      )}
    </div>
  );
}

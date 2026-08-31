import {
  Phone,
  HardHat,
  Wrench,
  AlertTriangle,
  PackageCheck,
  DownloadCloud,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import {
  TicketPriorityBadge,
  TicketTypeBadge,
} from "@/components/status-badge";
import { UstaStatusControl } from "@/components/usta-status-control";
import { UstaReturnActions } from "@/components/usta-return-actions";
import { VersionTicketStatusControl } from "@/components/version-ticket-status-control";
import { UstaTicketStatusControl } from "@/components/usta-ticket-status-control";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
import { PhoneCopyButton } from "@/components/phone-copy";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";

const RESOLVED_RENDER_CAP = 20;

/** Bir mijoz kartasi — ustaning har uch bo'limida bir xil qobiq. */
function ClientCard({
  restaurantName,
  fullName,
  region,
  phone,
  subject,
  badges,
  note,
  children,
}: {
  restaurantName: string;
  fullName: string;
  region: string | null;
  phone: string;
  /** Muammo sarlavhasi (masalan "Printer ishlamayapti") — faqat oddiy muammolar tab'ida ishlatiladi. */
  subject?: string;
  badges?: React.ReactNode;
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-3.5">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {restaurantName}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {fullName}
          {region && (
            <span className="text-slate-400 dark:text-slate-500">
              {" "}
              · {region}
            </span>
          )}
        </div>
      </div>
      {subject && (
        <div className="mt-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          {subject}
        </div>
      )}
      {badges && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {badges}
        </div>
      )}
      <div className="mt-2 inline-flex items-center gap-1 text-xs">
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
        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {note}
        </div>
      )}
      <div className="mt-2.5">{children}</div>
    </Card>
  );
}

/** Bir xil qobiqli, oxirida sana bilan yakunlangan karta — kanban'ning "Bajarildi" ustuni uchun. */
function DoneCard({
  restaurantName,
  fullName,
  region,
  phone,
  meta,
  note,
}: {
  restaurantName: string;
  fullName: string;
  region: string | null;
  phone: string;
  meta: string;
  note?: string | null;
}) {
  return (
    <ClientCard
      restaurantName={restaurantName}
      fullName={fullName}
      region={region}
      phone={phone}
      note={note}
    >
      <div className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <span aria-hidden>✓</span> {meta}
      </div>
    </ClientCard>
  );
}

/** Kanban ustuni — sarlavha (nuqta rang + nom + son) va ichida kartalar. */
function KanbanColumn({
  title,
  dotClassName,
  count,
  problem = false,
  children,
}: {
  title: string;
  dotClassName: string;
  count: number;
  problem?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-[268px] shrink-0 flex-col gap-2.5">
      <div className="flex items-center justify-center gap-2 px-1">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClassName)} />
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          {title}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          {count}
        </span>
      </div>
      <div
        className={cn(
          "flex min-h-[90px] flex-1 flex-col gap-2.5 rounded-xl border border-dashed p-2",
          problem
            ? "border-red-300 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20"
            : "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40",
        )}
      >
        {count === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Bo&apos;sh
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function KanbanBoard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-2">
      {children}
    </div>
  );
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
    ticketsMuammoActive,
    ticketsMuammoDone,
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
        ustaBlocked: true,
        ustaBlockedNote: true,
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
    db.ticket.findMany({
      where: {
        assignedUstaId: ustaId,
        type: { not: "VERSION_UPDATE" },
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
        type: { not: "VERSION_UPDATE" },
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

  // --- Eskalatsiya: Biriktirildi | Yo'ldaman | Bordim | Hal bo'lmadi | Bajarildi ---
  const eBiriktirildi = escalatedActive.filter(
    (c) =>
      !c.ustaBlocked && (c.ustaStatus === null || c.ustaStatus === "ASSIGNED"),
  );
  const eYoldaman = escalatedActive.filter(
    (c) => !c.ustaBlocked && c.ustaStatus === "EN_ROUTE",
  );
  const eBordim = escalatedActive.filter(
    (c) => !c.ustaBlocked && c.ustaStatus === "ARRIVED",
  );
  const eMuammo = escalatedActive.filter((c) => c.ustaBlocked);
  // Xavfsizlik to'ri — kelajakda kutilmagan ustaStatus qiymati bo'lsa ham
  // yo'qolib qolmasin (birinchi ustunga tushadi).
  const eKnown = new Set(
    [...eBiriktirildi, ...eYoldaman, ...eBordim, ...eMuammo].map((c) => c.id),
  );
  eBiriktirildi.push(...escalatedActive.filter((c) => !eKnown.has(c.id)));

  const escalationBoard = (
    <KanbanBoard>
      <KanbanColumn
        title="Biriktirildi"
        dotClassName="bg-slate-400"
        count={eBiriktirildi.length}
      >
        {eBiriktirildi.map((c) => (
          <ClientCard
            key={c.id}
            restaurantName={c.restaurantName}
            fullName={c.fullName}
            region={c.region}
            phone={c.phone}
            note={c.specialNote}
          >
            <UstaStatusControl clientId={c.id} current={c.ustaStatus} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Yo'ldaman"
        dotClassName="bg-amber-500"
        count={eYoldaman.length}
      >
        {eYoldaman.map((c) => (
          <ClientCard
            key={c.id}
            restaurantName={c.restaurantName}
            fullName={c.fullName}
            region={c.region}
            phone={c.phone}
            note={c.specialNote}
          >
            <UstaStatusControl clientId={c.id} current={c.ustaStatus} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Bordim"
        dotClassName="bg-sky-500"
        count={eBordim.length}
      >
        {eBordim.map((c) => (
          <ClientCard
            key={c.id}
            restaurantName={c.restaurantName}
            fullName={c.fullName}
            region={c.region}
            phone={c.phone}
            note={c.specialNote}
          >
            <UstaStatusControl clientId={c.id} current={c.ustaStatus} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Hal bo'lmadi"
        dotClassName="bg-red-500"
        count={eMuammo.length}
        problem
      >
        {eMuammo.map((c) => (
          <ClientCard
            key={c.id}
            restaurantName={c.restaurantName}
            fullName={c.fullName}
            region={c.region}
            phone={c.phone}
          >
            <UstaStatusControl
              clientId={c.id}
              current={c.ustaStatus}
              blocked={c.ustaBlocked}
              blockedNote={c.ustaBlockedNote}
            />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Bajarildi"
        dotClassName="bg-emerald-500"
        count={escalatedDone.length}
      >
        {escalatedDone.map((c) => (
          <DoneCard
            key={c.id}
            restaurantName={c.restaurantName}
            fullName={c.fullName}
            region={c.region}
            phone={c.phone}
            meta={formatDate(c.updatedAt)}
          />
        ))}
      </KanbanColumn>
    </KanbanBoard>
  );

  // --- Qaytarish: Biriktirilgan | Yo'lda | Hal bo'lmadi | Bajarildi ---
  const qBiriktirilgan = returnsActive.filter(
    (r) => !r.blocked && r.status === "APPROVED",
  );
  const qYolda = returnsActive.filter(
    (r) => !r.blocked && r.status === "IN_PROGRESS",
  );
  const qMuammo = returnsActive.filter((r) => r.blocked);

  const returnBoard = (
    <KanbanBoard>
      <KanbanColumn
        title="Biriktirilgan"
        dotClassName="bg-slate-400"
        count={qBiriktirilgan.length}
      >
        {qBiriktirilgan.map((r) => (
          <ClientCard
            key={r.id}
            restaurantName={r.client.restaurantName}
            fullName={r.client.fullName}
            region={r.client.region}
            phone={r.client.phone}
            note={r.note}
          >
            <UstaReturnActions requestId={r.id} status={r.status} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Yo'lda"
        dotClassName="bg-sky-500"
        count={qYolda.length}
      >
        {qYolda.map((r) => (
          <ClientCard
            key={r.id}
            restaurantName={r.client.restaurantName}
            fullName={r.client.fullName}
            region={r.client.region}
            phone={r.client.phone}
            note={r.note}
          >
            <UstaReturnActions requestId={r.id} status={r.status} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Hal bo'lmadi"
        dotClassName="bg-red-500"
        count={qMuammo.length}
        problem
      >
        {qMuammo.map((r) => (
          <ClientCard
            key={r.id}
            restaurantName={r.client.restaurantName}
            fullName={r.client.fullName}
            region={r.client.region}
            phone={r.client.phone}
          >
            <UstaReturnActions
              requestId={r.id}
              status={r.status}
              blocked={r.blocked}
              blockedNote={r.blockedNote}
            />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Bajarildi"
        dotClassName="bg-emerald-500"
        count={returnsDone.length}
      >
        {returnsDone.map((r) => (
          <DoneCard
            key={r.id}
            restaurantName={r.client.restaurantName}
            fullName={r.client.fullName}
            region={r.client.region}
            phone={r.client.phone}
            meta={r.resolvedAt ? formatDate(r.resolvedAt) : ""}
            note={r.resolutionNote}
          />
        ))}
      </KanbanColumn>
    </KanbanBoard>
  );

  // --- Yangi versiya: Ochiq | Jarayonda | Hal bo'lmadi | Bajarildi ---
  const vOchiq = ticketsActive.filter((t) => !t.blocked && t.status === "OPEN");
  const vJarayonda = ticketsActive.filter(
    (t) => !t.blocked && t.status === "IN_PROGRESS",
  );
  const vMuammo = ticketsActive.filter((t) => t.blocked);

  const versionBoard = (
    <KanbanBoard>
      <KanbanColumn
        title="Ochiq"
        dotClassName="bg-slate-400"
        count={vOchiq.length}
      >
        {vOchiq.map((t) => (
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
              </>
            }
          >
            <VersionTicketStatusControl ticketId={t.id} status={t.status} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Jarayonda"
        dotClassName="bg-amber-500"
        count={vJarayonda.length}
      >
        {vJarayonda.map((t) => (
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
              </>
            }
          >
            <VersionTicketStatusControl ticketId={t.id} status={t.status} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Hal bo'lmadi"
        dotClassName="bg-red-500"
        count={vMuammo.length}
        problem
      >
        {vMuammo.map((t) => (
          <ClientCard
            key={t.id}
            restaurantName={t.client.restaurantName}
            fullName={t.client.fullName}
            region={t.client.region}
            phone={t.client.phone}
            badges={
              <>
                <TicketTypeBadge type={t.type} />
                <TicketPriorityBadge priority={t.priority} />
              </>
            }
          >
            <VersionTicketStatusControl
              ticketId={t.id}
              status={t.status}
              blocked={t.blocked}
              blockedNote={t.blockedNote}
            />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Bajarildi"
        dotClassName="bg-emerald-500"
        count={ticketsDone.length}
      >
        {ticketsDone.map((t) => (
          <DoneCard
            key={t.id}
            restaurantName={t.client.restaurantName}
            fullName={t.client.fullName}
            region={t.client.region}
            phone={t.client.phone}
            meta={t.resolvedAt ? formatDate(t.resolvedAt) : ""}
            note={t.resolutionNote}
          />
        ))}
      </KanbanColumn>
    </KanbanBoard>
  );

  // --- Muammolar (oddiy ticketlar): Ochiq | Jarayonda | Hal bo'lmadi | Bajarildi ---
  const mOchiq = ticketsMuammoActive.filter(
    (t) => !t.blocked && t.status === "OPEN",
  );
  const mJarayonda = ticketsMuammoActive.filter(
    (t) => !t.blocked && t.status === "IN_PROGRESS",
  );
  const mMuammo = ticketsMuammoActive.filter((t) => t.blocked);

  const muammoBoard = (
    <KanbanBoard>
      <KanbanColumn
        title="Ochiq"
        dotClassName="bg-slate-400"
        count={mOchiq.length}
      >
        {mOchiq.map((t) => (
          <ClientCard
            key={t.id}
            restaurantName={t.client.restaurantName}
            fullName={t.client.fullName}
            region={t.client.region}
            phone={t.client.phone}
            subject={t.title}
            note={t.ustaNote}
            badges={
              <>
                <TicketTypeBadge type={t.type} />
                <TicketPriorityBadge priority={t.priority} />
              </>
            }
          >
            <UstaTicketStatusControl ticketId={t.id} status={t.status} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Jarayonda"
        dotClassName="bg-amber-500"
        count={mJarayonda.length}
      >
        {mJarayonda.map((t) => (
          <ClientCard
            key={t.id}
            restaurantName={t.client.restaurantName}
            fullName={t.client.fullName}
            region={t.client.region}
            phone={t.client.phone}
            subject={t.title}
            note={t.ustaNote}
            badges={
              <>
                <TicketTypeBadge type={t.type} />
                <TicketPriorityBadge priority={t.priority} />
              </>
            }
          >
            <UstaTicketStatusControl ticketId={t.id} status={t.status} />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Hal bo'lmadi"
        dotClassName="bg-red-500"
        count={mMuammo.length}
        problem
      >
        {mMuammo.map((t) => (
          <ClientCard
            key={t.id}
            restaurantName={t.client.restaurantName}
            fullName={t.client.fullName}
            region={t.client.region}
            phone={t.client.phone}
            subject={t.title}
            badges={
              <>
                <TicketTypeBadge type={t.type} />
                <TicketPriorityBadge priority={t.priority} />
              </>
            }
          >
            <UstaTicketStatusControl
              ticketId={t.id}
              status={t.status}
              blocked={t.blocked}
              blockedNote={t.blockedNote}
            />
          </ClientCard>
        ))}
      </KanbanColumn>
      <KanbanColumn
        title="Bajarildi"
        dotClassName="bg-emerald-500"
        count={ticketsMuammoDone.length}
      >
        {ticketsMuammoDone.map((t) => (
          <DoneCard
            key={t.id}
            restaurantName={t.client.restaurantName}
            fullName={t.client.fullName}
            region={t.client.region}
            phone={t.client.phone}
            meta={t.resolvedAt ? formatDate(t.resolvedAt) : ""}
            note={t.resolutionNote}
          />
        ))}
      </KanbanColumn>
    </KanbanBoard>
  );

  const activeCount = {
    muammolar: mOchiq.length + mJarayonda.length + mMuammo.length,
    eskalatsiya:
      eBiriktirildi.length + eYoldaman.length + eBordim.length + eMuammo.length,
    qaytarish: qBiriktirilgan.length + qYolda.length + qMuammo.length,
    versiya: vOchiq.length + vJarayonda.length + vMuammo.length,
  };

  const tabs: TicketTab[] = [
    {
      key: "muammolar",
      label: "Muammolar",
      icon: <Wrench className="h-4 w-4" />,
      tone: "violet",
      count: activeCount.muammolar,
      content: muammoBoard,
    },
    {
      key: "eskalatsiya",
      label: "Eskalatsiya",
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: "amber",
      count: activeCount.eskalatsiya,
      content: escalationBoard,
    },
    {
      key: "qaytarish",
      label: "Qaytarish",
      icon: <PackageCheck className="h-4 w-4" />,
      tone: "sky",
      count: activeCount.qaytarish,
      content: returnBoard,
    },
    {
      key: "versiya",
      label: "Yangi versiya",
      icon: <DownloadCloud className="h-4 w-4" />,
      tone: "red",
      count: activeCount.versiya,
      content: versionBoard,
    },
  ];

  const totalActive =
    activeCount.muammolar +
    activeCount.eskalatsiya +
    activeCount.qaytarish +
    activeCount.versiya;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Vazifalarim
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sizga biriktirilgan muammo, eskalatsiya, qaytarish va versiya so'rovlari
        </p>
      </div>

      {totalActive === 0 &&
      ticketsMuammoDone.length === 0 &&
      escalatedDone.length === 0 &&
      returnsDone.length === 0 &&
      ticketsDone.length === 0 ? (
        <EmptyState icon={HardHat} title="Sizga hali vazifa biriktirilmagan" />
      ) : (
        <TicketTabs tabs={tabs} initialKey="muammolar" />
      )}
    </div>
  );
}

import { ClientQuickView } from "@/components/client-quick-view";
import { Phone, Wrench, Inbox, UserCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketTypeBadge,
} from "@/components/status-badge";
import { TicketFilter } from "@/components/ticket-filter";
import { TicketStatusControl } from "@/components/ticket-status-control";
import { TicketDismissButton } from "@/components/ticket-dismiss-button";
import { TicketIntegratorControl } from "@/components/ticket-integrator-control";
import { TicketForm } from "@/components/ticket-form";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
import { PhoneCopyButton } from "@/components/phone-copy";
import { SpecialNoteBell } from "@/components/special-note-bell";
import { EmptyState } from "@/components/empty-state";
import { TICKET_TYPE, TICKET_PRIORITY } from "@/lib/constants";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { slaThreshold } from "@/lib/sla";
import { tzDayStartFromInput } from "@/lib/tz";
import { assignedStaffScope, isManagerRole } from "@/lib/visibility";

// Hal qilingan bo'limida ko'rsatiladigan maksimal karta (tarix o'smasin).
const RESOLVED_RENDER_CAP = 30;

// Ustuvorlik bo'yicha kartaning chap-chekka rangi.
const PRIORITY_ACCENT: Record<string, string> = {
  HIGH: "border-l-red-400 dark:border-l-red-500",
  MEDIUM: "border-l-amber-300 dark:border-l-amber-500",
  LOW: "border-l-slate-200 dark:border-l-slate-700",
};

export async function TicketsSection({
  session,
  type,
  priority,
  assignee,
  usta,
  resolveType,
  from,
  to,
  q,
}: {
  session: SessionPayload;
  type?: string;
  priority?: string;
  assignee?: string;
  usta?: string;
  resolveType?: string;
  from?: string;
  to?: string;
  q?: string;
}) {
  const canAssign = isManagerRole(session.role);

  // TP xodim (OPERATOR) faqat o'ziga maxsus xodim qilib biriktirilgan
  // muammolarni ko'radi; ADMIN/MANAGER esa barchasini (va biriktiradi).
  const scope = assignedStaffScope(session.role, session.userId, "assignedStaffId");

  // Filtr shartlari — ham ro'yxatga, ham tab sonlariga BIR XIL qo'llanadi.
  // AND massivida saqlanadi: mas'ul filtri OR ishlatgani uchun bo'lim
  // scope'laridagi (Yangi/Biriktirilgan) OR bilan to'qnashmasin.
  const filterAnd: Prisma.TicketWhereInput[] = [];
  if (type) filterAnd.push({ type });
  if (priority) filterAnd.push({ priority });
  // Mas'ul xodim bo'yicha filtr — faqat boshqaruv rollari uchun.
  if (assignee && canAssign) {
    filterAnd.push({ assignedStaffId: assignee });
  }
  if (usta) filterAnd.push({ assignedUstaId: usta });
  if (resolveType) filterAnd.push({ assigneeType: resolveType });
  const fromDate = tzDayStartFromInput(from);
  if (fromDate) filterAnd.push({ createdAt: { gte: fromDate } });
  const toDate = tzDayStartFromInput(to);
  if (toDate) filterAnd.push({ createdAt: { lt: new Date(toDate.getTime() + 86400000) } });
  if (q) {
    const digits = q.replace(/\D/g, "");
    filterAnd.push({
      client: {
        OR: [
          { restaurantName: { contains: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      },
    });
  }

  const where: Prisma.TicketWhereInput = { ...scope, AND: filterAnd };

  // Bo'lim (Yangi/Biriktirilgan/Hal) sanog'i — endi filtrga MOS (turi/ustuvorlik/
  // mas'ul tanlanganda tab sonlari ham shunga qarab o'zgaradi).
  const unassignedScope: Prisma.TicketWhereInput = {
    ...scope,
    AND: filterAnd,
    status: { not: "RESOLVED" },
    assignedStaffId: null,
    assignedUstaId: null,
  };
  const assignedScope: Prisma.TicketWhereInput = {
    ...scope,
    AND: filterAnd,
    status: { not: "RESOLVED" },
    OR: [{ assignedStaffId: { not: null } }, { assignedUstaId: { not: null } }],
  };

  const [
    ticketsRaw,
    clients,
    xodimlar,
    ustalarFull,
    yangiTotal,
    biriktirilganTotal,
    halTotal,
    slaBreached,
  ] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            restaurantName: true,
            fullName: true,
            phone: true,
            specialNote: true,
            specialNoteAt: true,
            specialNoteBy: { select: { name: true } },
            // Eng so'nggi bir nechtasi: birinchisi (calledAt bo'yicha) "oxirgi
            // harakat sanasi"ga, izohli birinchisi "oxirgi izoh"ga ishlatiladi.
            callLogs: {
              orderBy: { calledAt: "desc" },
              take: 5,
              select: {
                note: true,
                calledAt: true,
                operator: { select: { name: true } },
              },
            },
          },
        },
        assignedTo: { select: { name: true } },
        assignedUsta: { select: { id: true, name: true, phone: true } },
        assignedStaff: { select: { id: true, name: true, phone: true } },
      },
    }),
    db.client.findMany({
      select: { id: true, restaurantName: true, fullName: true },
      orderBy: { restaurantName: "asc" },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "OPERATOR"] }, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.ticket.count({ where: unassignedScope }),
    db.ticket.count({ where: assignedScope }),
    db.ticket.count({ where: { ...scope, AND: filterAnd, status: "RESOLVED" } }),
    db.ticket.count({
      where: {
        ...scope,
        AND: filterAnd,
        status: { not: "RESOLVED" },
        createdAt: { lt: slaThreshold() },
      },
    }),
  ]);

  // Ko'rsatilayotgan (filtrlangan) ticketlarni uch bo'limga ajratamiz.
  const isAssigned = (t: (typeof ticketsRaw)[number]) =>
    !!t.assignedStaffId || !!t.assignedUstaId;
  const yangi = ticketsRaw.filter((t) => t.status !== "RESOLVED" && !isAssigned(t));
  const biriktirilgan = ticketsRaw.filter((t) => t.status !== "RESOLVED" && isAssigned(t));
  const hal = ticketsRaw.filter((t) => t.status === "RESOLVED");

  const openCount = yangiTotal + biriktirilganTotal;
  const hasFilter = !!(type || priority || assignee || usta || resolveType || from || to || q);

  // Bitta ticket kartasi — barcha tab'larda bir xil.
  function ticketCard(t: (typeof ticketsRaw)[number]) {
    const lastAction = t.client.callLogs[0] ?? null;
    const lastNote = t.client.callLogs.find((l) => l.note) ?? null;
    // Ochilgandan keyin biror harakat bo'lgan bo'lsa (biriktirish/holat
    // o'zgarishi) alohida ko'rsatamiz — bo'lmasa "Ochilgan" bilan bir xil
    // sanani takrorlamaymiz.
    const lastActionAt =
      lastAction && lastAction.calledAt.getTime() !== t.createdAt.getTime()
        ? lastAction.calledAt
        : null;
    return (
      <Card
        key={t.id}
        className={`border-l-4 p-4 ${PRIORITY_ACCENT[t.priority] ?? PRIORITY_ACCENT.LOW}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
            <span className="inline-flex items-center gap-1.5">
              <ClientQuickView
                id={t.client.id}
                name={t.client.restaurantName}
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700"
              />
              <SpecialNoteBell
                clientId={t.client.id}
                restaurantName={t.client.restaurantName || t.client.fullName}
                note={t.client.specialNote}
                noteBy={t.client.specialNoteBy?.name ?? null}
                noteAt={t.client.specialNoteAt ? t.client.specialNoteAt.toISOString() : null}
              />
            </span>
            <span className="text-sm text-slate-400 dark:text-slate-500"> · {t.client.fullName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TicketTypeBadge type={t.type} />
            <TicketPriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          <span>Ochilgan: {formatDate(t.createdAt)}</span>
          {lastActionAt && <span>· Oxirgi harakat: {formatDate(lastActionAt)}</span>}
          {t.status === "RESOLVED" && t.resolvedAt && (
            <span>· Hal qilindi: {formatDate(t.resolvedAt)}</span>
          )}
          {t.assignedStaff && <span>· mas'ul: {t.assignedStaff.name}</span>}
          {t.assignedUsta && <span>· usta: {t.assignedUsta.name}</span>}
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

        {lastNote?.note && (
          <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <span className="font-medium">Oxirgi izoh:</span> {lastNote.note}
            <span className="ml-1 text-xs text-amber-700/70 dark:text-amber-300/70">
              ({formatDate(lastNote.calledAt)}
              {lastNote.operator ? ` · ${lastNote.operator.name}` : ""})
            </span>
          </div>
        )}

        {t.resolutionNote && (
          <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            Yechim: {t.resolutionNote}
          </div>
        )}

        <div className="mt-3">
          <TicketIntegratorControl
            ticketId={t.id}
            canAssign={canAssign}
            staff={t.assignedStaff ?? null}
            staffNote={t.staffNote}
            xodimlar={xodimlar}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TicketStatusControl ticketId={t.id} status={t.status} />
          {/* Xato ochilgan muammoni boshliq bir bosishda yopadi */}
          {canAssign && t.status !== "RESOLVED" && (
            <TicketDismissButton ticketId={t.id} title={t.title} />
          )}
        </div>
      </Card>
    );
  }

  // Bo'lim ichi: bo'sh bo'lsa nozik ko'rsatkich, aks holda kartalar ro'yxati.
  function panel(items: (typeof ticketsRaw), emptyHint: string, resolved = false) {
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
            Yana {items.length - RESOLVED_RENDER_CAP} ta hal qilingan muammo (filtr bilan toraytiring)
          </p>
        )}
      </div>
    );
  }

  const tabs: TicketTab[] = [];
  if (canAssign) {
    tabs.push({
      key: "yangi",
      label: "Yangi",
      icon: <Inbox className="h-4 w-4" />,
      tone: "red", // yangi tushgan muammolar — qizil (e'tibor talab qiladi)
      count: yangiTotal,
      content: panel(yangi, "Biriktirilmagan yangi muammo yo'q."),
    });
  }
  tabs.push({
    key: "biriktirilgan",
    label: "Biriktirilgan",
    icon: <UserCheck className="h-4 w-4" />,
    // Admin/menejerda sariq (nazorat), xodimda qizil (bajarilishi kutilmoqda)
    tone: canAssign ? "amber" : "red",
    count: biriktirilganTotal,
    content: panel(
      biriktirilgan,
      canAssign ? "Biriktirilgan (jarayondagi) muammo yo'q." : "Sizga biriktirilgan ochiq muammo yo'q.",
    ),
  });
  tabs.push({
    key: "hal",
    label: "Hal qilingan",
    icon: <CheckCircle2 className="h-4 w-4" />,
    tone: "emerald",
    count: halTotal,
    content: panel(hal, "Hal qilingan muammo yo'q.", true),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {openCount} ta ochiq · {halTotal} ta hal qilingan
        </p>
        {slaBreached > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            {slaBreached} ta 3 kundan oshgan
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`space-y-5 ${canAssign ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <Card className="p-4">
            <TicketFilter
              type={type ?? ""}
              priority={priority ?? ""}
              assignee={assignee ?? ""}
              usta={usta ?? ""}
              resolveType={resolveType ?? ""}
              from={from ?? ""}
              to={to ?? ""}
              q={q ?? ""}
              types={Object.entries(TICKET_TYPE)}
              priorities={Object.entries(TICKET_PRIORITY)}
              xodimlar={xodimlar}
              ustalar={ustalarFull}
              canAssign={canAssign}
            />
          </Card>

          {ticketsRaw.length === 0 && hasFilter ? (
            <EmptyState icon={Wrench} title="Muammo topilmadi" hint="Filtrga mos muammo yo'q." />
          ) : (
            <TicketTabs tabs={tabs} initialKey={canAssign ? "yangi" : "biriktirilgan"} />
          )}
        </div>

        {/* Yangi muammo yaratish — faqat boshliq/admin (xodimga admin biriktiradi) */}
        {canAssign && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Yangi muammo</CardTitle>
              </CardHeader>
              <CardContent>
                <TicketForm clients={clients} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

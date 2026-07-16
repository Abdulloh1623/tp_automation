import Link from "next/link";
import {
  Phone,
  Wrench,
  Inbox,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketTypeBadge,
} from "@/components/status-badge";
import { TicketStatusControl } from "@/components/ticket-status-control";
import { TicketIntegratorControl } from "@/components/ticket-integrator-control";
import { TicketForm } from "@/components/ticket-form";
import { TicketTabs, type TicketTab } from "@/components/ticket-tabs";
import { PhoneCopyButton } from "@/components/phone-copy";
import { EmptyState } from "@/components/empty-state";
import { TICKET_TYPE, TICKET_PRIORITY } from "@/lib/constants";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { slaThreshold } from "@/lib/sla";
import { assignedStaffScope, isManagerRole } from "@/lib/visibility";

type SearchParams = Promise<{
  type?: string;
  priority?: string;
  assignee?: string;
}>;

// Hal qilingan bo'limida ko'rsatiladigan maksimal karta (tarix o'smasin).
const RESOLVED_RENDER_CAP = 30;

// Ustuvorlik bo'yicha kartaning chap-chekka rangi.
const PRIORITY_ACCENT: Record<string, string> = {
  HIGH: "border-l-red-400 dark:border-l-red-500",
  MEDIUM: "border-l-amber-300 dark:border-l-amber-500",
  LOW: "border-l-slate-200 dark:border-l-slate-700",
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { type, priority, assignee } = await searchParams;
  const session = await requireSession();
  const canAssign = isManagerRole(session.role);

  // TP xodim (OPERATOR) faqat o'ziga maxsus xodim qilib biriktirilgan
  // muammolarni ko'radi; ADMIN/MANAGER esa barchasini (va biriktiradi).
  const scope = assignedStaffScope(session.role, session.userId, "assignedStaffId");

  const where: Prisma.TicketWhereInput = { ...scope };
  if (type) where.type = type;
  if (priority) where.priority = priority;
  // Mas'ul (xodim yoki usta) bo'yicha filtr — faqat boshqaruv rollari uchun.
  if (assignee && canAssign) {
    where.OR = [{ assignedStaffId: assignee }, { assignedUstaId: assignee }];
  }

  // Bo'lim (Yangi/Biriktirilgan/Hal) sanog'i — QAMROV bo'yicha (filtrdan mustaqil),
  // tab'lardagi sonlar doim barqaror ko'rinsin.
  const unassignedScope: Prisma.TicketWhereInput = {
    ...scope,
    status: { not: "RESOLVED" },
    assignedStaffId: null,
    assignedUstaId: null,
  };
  const assignedScope: Prisma.TicketWhereInput = {
    ...scope,
    status: { not: "RESOLVED" },
    OR: [{ assignedStaffId: { not: null } }, { assignedUstaId: { not: null } }],
  };

  const [
    ticketsRaw,
    clients,
    ustalar,
    xodimlar,
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
            callLogs: {
              where: { note: { not: null } },
              orderBy: { calledAt: "desc" },
              take: 1,
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
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "OPERATOR"] }, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db.ticket.count({ where: unassignedScope }),
    db.ticket.count({ where: assignedScope }),
    db.ticket.count({ where: { ...scope, status: "RESOLVED" } }),
    db.ticket.count({
      where: { ...scope, status: { not: "RESOLVED" }, createdAt: { lt: slaThreshold() } },
    }),
  ]);

  // Ko'rsatilayotgan (filtrlangan) ticketlarni uch bo'limga ajratamiz.
  const isAssigned = (t: (typeof ticketsRaw)[number]) =>
    !!t.assignedStaffId || !!t.assignedUstaId;
  const yangi = ticketsRaw.filter((t) => t.status !== "RESOLVED" && !isAssigned(t));
  const biriktirilgan = ticketsRaw.filter((t) => t.status !== "RESOLVED" && isAssigned(t));
  const hal = ticketsRaw.filter((t) => t.status === "RESOLVED");

  const openCount = yangiTotal + biriktirilganTotal;
  const hasFilter = !!(type || priority || assignee);

  // Bitta ticket kartasi — barcha tab'larda bir xil.
  function ticketCard(t: (typeof ticketsRaw)[number]) {
    return (
      <Card
        key={t.id}
        className={`border-l-4 p-4 ${PRIORITY_ACCENT[t.priority] ?? PRIORITY_ACCENT.LOW}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
            <Link
              href={`/mijozlar/${t.client.id}`}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700"
            >
              {t.client.restaurantName}
            </Link>
            <span className="text-sm text-slate-400 dark:text-slate-500"> · {t.client.fullName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TicketTypeBadge type={t.type} />
            <TicketPriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          <span>{formatDate(t.createdAt)}</span>
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

        {t.client.callLogs[0]?.note && (
          <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <span className="font-medium">Oxirgi izoh:</span> {t.client.callLogs[0].note}
            <span className="ml-1 text-xs text-amber-700/70 dark:text-amber-300/70">
              ({formatDate(t.client.callLogs[0].calledAt)}
              {t.client.callLogs[0].operator ? ` · ${t.client.callLogs[0].operator.name}` : ""})
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
            usta={t.assignedUsta ?? null}
            ustalar={ustalar}
            xodimlar={xodimlar}
          />
        </div>

        <div className="mt-3">
          <TicketStatusControl ticketId={t.id} status={t.status} />
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
      tone: "amber",
      count: yangiTotal,
      content: panel(yangi, "Biriktirilmagan yangi muammo yo'q."),
    });
  }
  tabs.push({
    key: "biriktirilgan",
    label: "Biriktirilgan",
    icon: <UserCheck className="h-4 w-4" />,
    tone: "sky",
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Muammolar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {openCount} ta ochiq · {halTotal} ta hal qilingan
          </p>
        </div>
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
            <form className="flex flex-wrap items-end gap-3" method="get">
              <div className="w-40">
                <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Turi
                </label>
                <Select name="type" defaultValue={type ?? ""}>
                  <option value="">Barchasi</option>
                  {Object.entries(TICKET_TYPE).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-40">
                <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Ustuvorlik
                </label>
                <Select name="priority" defaultValue={priority ?? ""}>
                  <option value="">Barchasi</option>
                  {Object.entries(TICKET_PRIORITY).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              {canAssign && (
                <div className="w-52">
                  <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Mas'ul (xodim/usta)
                  </label>
                  <Select name="assignee" defaultValue={assignee ?? ""}>
                    <option value="">Barchasi</option>
                    <optgroup label="Xodimlar">
                      {xodimlar.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Ustalar">
                      {ustalar.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </div>
              )}
              <Button type="submit" variant="outline">
                Filtrlash
              </Button>
            </form>
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

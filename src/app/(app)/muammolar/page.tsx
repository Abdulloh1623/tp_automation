import Link from "next/link";
import { Phone, Wrench } from "lucide-react";
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
import { PhoneCopyButton } from "@/components/phone-copy";
import { CountStrip, type CountItem } from "@/components/count-strip";
import { EmptyState } from "@/components/empty-state";
import { TICKET_STATUS, TICKET_TYPE, TICKET_PRIORITY } from "@/lib/constants";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";
import { slaThreshold } from "@/lib/sla";
import { assignedStaffScope } from "@/lib/visibility";

type SearchParams = Promise<{
  status?: string;
  type?: string;
  priority?: string;
}>;

const STATUS_RANK: Record<string, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status, type, priority } = await searchParams;
  const session = await requireSession();
  const canAssign = session.role === "ADMIN" || session.role === "MANAGER";

  // TP xodim (OPERATOR) faqat o'ziga maxsus xodim qilib biriktirilgan
  // muammolarni ko'radi; ADMIN/MANAGER esa barchasini (va biriktiradi).
  const scope = assignedStaffScope(session.role, session.userId, "assignedStaffId");

  const where: Prisma.TicketWhereInput = { ...scope };
  if (status) where.status = status;
  if (type) where.type = type;
  if (priority) where.priority = priority;

  const [ticketsRaw, clients, ustalar, xodimlar, byStatus, slaBreached] = await Promise.all([
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
            // Mijozning oxirgi izohli qo'ng'irog'i — muammo tafsiloti kartada ko'rinadi
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
    // Ofis xodimlari — muammoni online hal etish uchun biriktiriladi
    db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "OPERATOR"] }, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    // Umumiy ko'rinish uchun — filtrga bog'liq bo'lmagan holat sanog'i
    // (xodim qamrovida — faqat o'ziga biriktirilganlar bo'yicha)
    db.ticket.groupBy({ by: ["status"], where: scope, _count: true }),
    // 3 kundan oshgan hal bo'lmagan muammolar (SLA buzilishi)
    db.ticket.count({
      where: { ...scope, status: { not: "RESOLVED" }, createdAt: { lt: slaThreshold() } },
    }),
  ]);

  const tickets = ticketsRaw.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );

  const openCount = ticketsRaw.filter((t) => t.status !== "RESOLVED").length;

  const statusCount = (k: string) => byStatus.find((g) => g.status === k)?._count ?? 0;
  const totalTickets = byStatus.reduce((s, g) => s + g._count, 0);
  const summary: CountItem[] = [
    { label: "Jami", value: totalTickets },
    { label: TICKET_STATUS.OPEN, value: statusCount("OPEN"), tone: "amber" },
    { label: TICKET_STATUS.IN_PROGRESS, value: statusCount("IN_PROGRESS"), tone: "sky" },
    { label: TICKET_STATUS.RESOLVED, value: statusCount("RESOLVED"), tone: "emerald" },
    { label: "3 kundan oshgan", value: slaBreached, tone: "red" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Muammolar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {tickets.length} ta muammo · {openCount} ta ochiq
        </p>
        <div className="mt-3">
          <CountStrip items={summary} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`space-y-6 ${canAssign ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <Card className="p-4">
            <form className="flex flex-wrap items-end gap-3" method="get">
              <div className="w-40">
                <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Holat
                </label>
                <Select name="status" defaultValue={status ?? ""}>
                  <option value="">Barchasi</option>
                  {Object.entries(TICKET_STATUS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
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
              <Button type="submit" variant="outline">
                Filtrlash
              </Button>
            </form>
          </Card>

          <div className="space-y-3">
            {tickets.length === 0 && (
              <EmptyState
                icon={Wrench}
                title="Muammo topilmadi"
                hint={canAssign ? "Hozircha ochiq muammo yo'q." : "Sizga biriktirilgan muammo yo'q."}
              />
            )}
            {tickets.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                    <Link
                      href={`/mijozlar/${t.client.id}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700"
                    >
                      {t.client.restaurantName}
                    </Link>
                    <span className="text-sm text-slate-400 dark:text-slate-500">
                      {" "}
                      · {t.client.fullName}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TicketTypeBadge type={t.type} />
                    <TicketPriorityBadge priority={t.priority} />
                    <TicketStatusBadge status={t.status} />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                  <span>{formatDate(t.createdAt)}</span>
                  {t.assignedTo && <span>· mas'ul: {t.assignedTo.name}</span>}
                  <span className="inline-flex items-center gap-1">
                    ·
                    <a
                      href={`tel:${normalizePhone(t.client.phone)}`}
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"
                    >
                      <Phone className="h-3 w-3" />
                      {formatPhone(t.client.phone)}
                    </a>
                    <PhoneCopyButton phone={t.client.phone} />
                  </span>
                </div>

                {/* Mijozning oxirgi izohi — muammo nima ekani profilga kirmasdan ko'rinadi */}
                {t.client.callLogs[0]?.note && (
                  <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                    <span className="font-medium">Oxirgi izoh:</span>{" "}
                    {t.client.callLogs[0].note}
                    <span className="ml-1 text-xs text-amber-700/70 dark:text-amber-300/70">
                      ({formatDate(t.client.callLogs[0].calledAt)}
                      {t.client.callLogs[0].operator
                        ? ` · ${t.client.callLogs[0].operator.name}`
                        : ""}
                      )
                    </span>
                  </div>
                )}

                {t.resolutionNote && (
                  <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                    Yechim: {t.resolutionNote}
                  </div>
                )}

                {/* Biriktirish — boshliq ustaga (joyida) yoki xodimga (online) biriktiradi */}
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
            ))}
          </div>
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

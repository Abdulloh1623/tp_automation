import Link from "next/link";
import { Phone } from "lucide-react";
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
import { TICKET_STATUS, TICKET_TYPE, TICKET_PRIORITY } from "@/lib/constants";
import { formatDate, formatPhone, normalizePhone } from "@/lib/utils";

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

  const where: Prisma.TicketWhereInput = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (priority) where.priority = priority;

  const [ticketsRaw, clients, ustalar] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, restaurantName: true, fullName: true, phone: true } },
        assignedTo: { select: { name: true } },
        assignedUsta: { select: { id: true, name: true, phone: true } },
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
  ]);

  const tickets = ticketsRaw.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );

  const openCount = ticketsRaw.filter((t) => t.status !== "RESOLVED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Muammolar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {tickets.length} ta muammo · {openCount} ta ochiq
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
              <Card className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">
                Muammo topilmadi
              </Card>
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

                {t.resolutionNote && (
                  <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                    Yechim: {t.resolutionNote}
                  </div>
                )}

                {/* Integrator (usta) — boshliq biriktiradi, TP xodimlari holatni yuritadi */}
                <div className="mt-3">
                  <TicketIntegratorControl
                    ticketId={t.id}
                    canAssign={canAssign}
                    assignedId={t.assignedUsta?.id ?? null}
                    assignedName={t.assignedUsta?.name ?? null}
                    assignedPhone={t.assignedUsta?.phone ?? null}
                    ustalar={ustalar}
                  />
                </div>

                <div className="mt-3">
                  <TicketStatusControl ticketId={t.id} status={t.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>

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
      </div>
    </div>
  );
}

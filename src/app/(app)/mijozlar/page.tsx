import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Plus, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ClientsFilter } from "@/components/clients-filter";
import { ClientsTable, type ClientRow } from "@/components/clients-table";
import { CLIENT_STATUS, REGIONS } from "@/lib/constants";

type SearchParams = Promise<{
  q?: string;
  region?: string;
  status?: string;
  assigned?: string;
  sort?: string;
  dir?: string;
  page?: string;
}>;

const PAGE_SIZE = 50;
const SORTABLE: Record<string, true> = {
  restaurantName: true,
  region: true,
  monthlyAmount: true,
  nextPaymentDate: true,
  createdAt: true,
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole(["ADMIN", "OPERATOR", "MANAGER"]);
  const canManage = session.role === "ADMIN" || session.role === "MANAGER";
  const sp = await searchParams;

  const q = sp.q?.trim() || "";
  const region = sp.region || "";
  const status = sp.status || "";
  const assigned = sp.assigned || "";
  const sort = sp.sort && SORTABLE[sp.sort] ? sp.sort : "createdAt";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const where: Prisma.ClientWhereInput = {};
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { restaurantName: { contains: q } },
      { phone: { contains: q } },
      { contractNumber: { contains: q } },
    ];
  }
  if (region) where.region = region;
  if (status) where.status = status;
  if (assigned === "__none__") where.assignedToId = null;
  else if (assigned) where.assignedToId = assigned;

  const operators = await db.user.findMany({
    where: { role: { in: ["OPERATOR", "ADMIN", "MANAGER"] }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const total = await db.client.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  const clientsRaw = await db.client.findMany({
    where,
    orderBy: { [sort]: dir },
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      callLogs: {
        orderBy: { calledAt: "desc" },
        take: 1,
        select: { operator: { select: { name: true } } },
      },
    },
  });

  const clients: ClientRow[] = clientsRaw.map((c) => ({
    id: c.id,
    restaurantName: c.restaurantName,
    fullName: c.fullName,
    region: c.region,
    phone: c.phone,
    status: c.status,
    nextPaymentDate: c.nextPaymentDate ? c.nextPaymentDate.toISOString() : null,
    monthlyAmount: c.monthlyAmount,
    currency: c.currency,
    lastOperatorName: c.callLogs[0]?.operator?.name ?? null,
  }));

  // Sahifa havolasini joriy filtrlarni saqlab tuzish
  function pageHref(p: number) {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (region) u.set("region", region);
    if (status) u.set("status", status);
    if (assigned) u.set("assigned", assigned);
    if (sort !== "createdAt") u.set("sort", sort);
    if (dir !== "desc") u.set("dir", dir);
    u.set("page", String(p));
    return `/mijozlar?${u.toString()}`;
  }

  const from = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const to = Math.min(current * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mijozlar</h1>
          <p className="text-sm text-slate-500">
            Jami {total} ta mijoz{total > 0 ? ` · ${from}–${to} ko'rsatilmoqda` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/export/clients"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Excel
          </a>
          <Link href="/mijozlar/yangi">
            <Button>
              <Plus className="h-4 w-4" />
              Yangi mijoz
            </Button>
          </Link>
        </div>
      </div>

      <ClientsFilter
        regions={REGIONS}
        statuses={Object.entries(CLIENT_STATUS)}
        operators={operators}
      />

      <ClientsTable
        clients={clients}
        operators={operators}
        canManage={canManage}
        sort={sort}
        dir={dir}
      />

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {current} / {pageCount} sahifa
          </p>
          <div className="flex items-center gap-2">
            {current > 1 ? (
              <Link href={pageHref(current - 1)}>
                <Button variant="outline" size="sm">
                  <ChevronLeft className="h-4 w-4" /> Oldingi
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="h-4 w-4" /> Oldingi
              </Button>
            )}
            {current < pageCount ? (
              <Link href={pageHref(current + 1)}>
                <Button variant="outline" size="sm">
                  Keyingi <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Keyingi <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

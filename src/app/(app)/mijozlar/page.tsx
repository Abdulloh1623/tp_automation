import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Plus, Download, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ClientsFilter } from "@/components/clients-filter";
import { ClientsTable, type ClientRow } from "@/components/clients-table";
import { CLIENT_STATUS, REGIONS } from "@/lib/constants";
import { countDuplicateGroups } from "@/lib/duplicates-data";
import { SILENT_CHURN_STATUSES } from "@/lib/silent-churn";

type SearchParams = Promise<{
  q?: string;
  region?: string;
  status?: string;
  assigned?: string;
  biznex?: string;
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
  const biznex = sp.biznex || "";
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
  // Otkaz qilingan (stage REFUSED) mijozlar umumiy ro'yxatda HECH QACHON
  // ko'rinmaydi — holat filtri tanlansa ham (otkaz mijoz status ACTIVE bo'lib
  // qolishi mumkin). Ular faqat /otkaz sahifasida ochiladi.
  where.stage = { not: "REFUSED" };
  if (assigned === "__none__") where.assignedToId = null;
  else if (assigned) where.assignedToId = assigned;
  // Biznex flaglari — fon skripti (`npm run sync-biznex`) qo'yadi.
  // `not_found` — telefon bo'yicha moslik topilmadi (ma'lumot sifati);
  // `silent_churn` — obunasi tugagan, lekin CRM'da hali faol (MRR xavf ostida).
  if (biznex === "not_found") where.biznexStatus = "NOT_FOUND";
  else if (biznex === "silent_churn") {
    where.biznexStatus = { in: [...SILENT_CHURN_STATUSES] };
    where.status = "ACTIVE";
  }

  // Uchta mustaqil so'rov parallel; mijozlar ro'yxati esa `total`ga bog'liq
  // (sahifa raqami cheklanadi), shuning uchun undan keyin ketadi.
  const [operators, total, dupGroups] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["OPERATOR", "ADMIN", "MANAGER"] }, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.client.count({ where }),
    countDuplicateGroups(),
  ]);
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
      specialNoteBy: { select: { name: true } },
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
    specialNote: c.specialNote,
    specialNoteBy: c.specialNoteBy?.name ?? null,
    specialNoteAt: c.specialNoteAt ? c.specialNoteAt.toISOString() : null,
  }));

  // Sahifa havolasini joriy filtrlarni saqlab tuzish
  function pageHref(p: number) {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (region) u.set("region", region);
    if (status) u.set("status", status);
    if (assigned) u.set("assigned", assigned);
    if (biznex) u.set("biznex", biznex);
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
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Mijozlar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Jami {total} ta mijoz{total > 0 ? ` · ${from}–${to} ko'rsatilmoqda` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {dupGroups > 0 && (
            <Link href="/mijozlar/dublikatlar">
              <Button
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
              >
                <Copy className="h-4 w-4" />
                Dublikatlar
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                  {dupGroups}
                </span>
              </Button>
            </Link>
          )}
          <a
            href="/api/export/clients"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
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

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseRegions } from "@/lib/constants";
import {
  ReturnQueue,
  type ReturnQueueItem,
  type UstaOpt,
} from "@/components/return-queue";
import { ReturnStats, type ReturnStatsData } from "@/components/return-stats";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function QaytarishPage() {
  const session = await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);

  const clientSelect = {
    id: true,
    restaurantName: true,
    fullName: true,
    phone: true,
    region: true,
    specialNote: true,
    specialNoteAt: true,
    specialNoteBy: { select: { name: true } },
  } as const;

  const [openReqs, doneReqs, ustalarFull, users] = await Promise.all([
    // Ochiq navbat: yangi, biriktirilgan, jarayonda
    db.equipmentReturnRequest.findMany({
      where: { status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } },
      orderBy: { createdAt: "asc" },
      include: { client: { select: clientSelect } },
    }),
    // Yakunlangan (uskunalar qaytarilgan) — oxirgi 50 ta
    db.equipmentReturnRequest.findMany({
      where: { status: "DONE" },
      orderBy: { resolvedAt: "desc" },
      take: 50,
      include: { client: { select: clientSelect } },
    }),
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, phone: true, region: true, regions: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ select: { id: true, name: true, phone: true } }),
  ]);

  const requests = [...openReqs, ...doneReqs];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Viloyat -> usta id (avtomatik taklif)
  const regionUsta = new Map<string, string>();
  for (const u of ustalarFull) {
    for (const r of parseRegions(u.regions, u.region)) {
      if (!regionUsta.has(r)) regionUsta.set(r, u.id);
    }
  }

  const items: ReturnQueueItem[] = requests.map((r) => ({
    id: r.id,
    status: r.status,
    clientId: r.client.id,
    restaurantName: r.client.restaurantName,
    fullName: r.client.fullName,
    phone: r.client.phone,
    region: r.client.region,
    specialNote: r.client.specialNote,
    specialNoteBy: r.client.specialNoteBy?.name ?? null,
    specialNoteAt: r.client.specialNoteAt ? r.client.specialNoteAt.toISOString() : null,
    note: r.note,
    byName: r.byUserId ? userById.get(r.byUserId)?.name ?? null : null,
    ustaName: r.ustaId ? userById.get(r.ustaId)?.name ?? null : null,
    ustaPhone: r.ustaId ? userById.get(r.ustaId)?.phone ?? null : null,
    matchedUstaId: r.client.region ? regionUsta.get(r.client.region) ?? null : null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));

  const ustalar: UstaOpt[] = ustalarFull.map((u) => ({ id: u.id, name: u.name }));
  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const approvedCount = items.filter((i) => i.status === "APPROVED").length;
  const inProgressCount = items.filter((i) => i.status === "IN_PROGRESS").length;

  // Boshliq uchun umumiy hisobot (jarayon nazorati)
  let stats: ReturnStatsData | null = null;
  if (isManager) {
    const monthAgo = new Date(Date.now() - 30 * DAY_MS);
    const [doneTotal, rejectedTotal, done30, resolved] = await Promise.all([
      db.equipmentReturnRequest.count({ where: { status: "DONE" } }),
      db.equipmentReturnRequest.count({ where: { status: "REJECTED" } }),
      db.equipmentReturnRequest.count({
        where: { status: "DONE", resolvedAt: { gte: monthAgo } },
      }),
      db.equipmentReturnRequest.findMany({
        where: { status: "DONE", resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        orderBy: { resolvedAt: "desc" },
        take: 100,
      }),
    ]);
    const durations = resolved
      .filter((r) => r.resolvedAt)
      .map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / DAY_MS);
    const avgDays =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;
    stats = {
      pending: pendingCount,
      assigned: approvedCount,
      inProgress: inProgressCount,
      doneTotal,
      done30,
      rejectedTotal,
      avgDays,
    };
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Qaytariladigan uskunalar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isManager
            ? "Yangi arizaga usta biriktiring — keyingi kuzatuvni TP xodimlari olib boradi."
            : "Usta biriktirilgan arizalarni kuzating: usta/mijoz bilan bog'laning va uskuna olib kelingach yakunlang."}
          {" "}Yangi: {pendingCount} · Biriktirilgan: {approvedCount} · Jarayonda: {inProgressCount}
        </p>
      </div>
      {stats && <ReturnStats stats={stats} />}
      <ReturnQueue items={items} ustalar={ustalar} canAssign={isManager} />
    </div>
  );
}

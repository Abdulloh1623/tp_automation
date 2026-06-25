import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseRegions } from "@/lib/constants";
import {
  ReturnQueue,
  type ReturnQueueItem,
  type UstaOpt,
} from "@/components/return-queue";

export const dynamic = "force-dynamic";

export default async function QaytarishPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const [requests, ustalarFull, users] = await Promise.all([
    db.equipmentReturnRequest.findMany({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      orderBy: { createdAt: "asc" },
      include: {
        client: {
          select: { restaurantName: true, fullName: true, phone: true, region: true },
        },
      },
    }),
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, region: true, regions: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);

  const userName = new Map(users.map((u) => [u.id, u.name]));

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
    restaurantName: r.client.restaurantName,
    fullName: r.client.fullName,
    phone: r.client.phone,
    region: r.client.region,
    note: r.note,
    byName: r.byUserId ? userName.get(r.byUserId) ?? null : null,
    ustaName: r.ustaId ? userName.get(r.ustaId) ?? null : null,
    matchedUstaId: r.client.region ? regionUsta.get(r.client.region) ?? null : null,
  }));

  const ustalar: UstaOpt[] = ustalarFull.map((u) => ({ id: u.id, name: u.name }));
  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const approvedCount = items.filter((i) => i.status === "APPROVED").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Qaytariladigan uskunalar</h1>
        <p className="text-sm text-slate-500">
          Operator &quot;Uskuna qaytarish kerak&quot; qo&apos;ygan lidlar — usta biriktiring va ishni
          nazorat qiling. Yangi: {pendingCount} · Ustada: {approvedCount}
        </p>
      </div>
      <ReturnQueue items={items} ustalar={ustalar} />
    </div>
  );
}

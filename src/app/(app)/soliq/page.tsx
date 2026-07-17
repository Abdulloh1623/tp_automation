import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { SoliqQueue, type SoliqQueueItem } from "@/components/soliq-queue";

export const dynamic = "force-dynamic";

/** Saqlangan relPath ('soliq/<uuid>.<ext>') -> himoyalangan URL. */
function docUrl(p: string | null): string | null {
  return p ? `/api/soliq/${p.replace(/^soliq\//, "")}` : null;
}

export default async function SoliqPage() {
  const session = await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);

  // Operator faqat o'zi yuborganlarni; boshliq hammasini ko'radi.
  const where = isManager ? {} : { byUserId: session.userId };

  const [rows, users] = await Promise.all([
    db.taxConnection.findMany({
      where,
      orderBy: [{ status: "desc" }, { createdAt: "desc" }], // PENDING oldin
      include: {
        client: {
          select: { id: true, restaurantName: true, fullName: true, phone: true, region: true },
        },
      },
    }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);

  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const items: SoliqQueueItem[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    clientId: r.client.id,
    restaurantName: r.client.restaurantName,
    fullName: r.client.fullName,
    phone: r.client.phone,
    region: r.client.region,
    certificateNo: r.certificateNo,
    directorName: r.directorName,
    directorPhone: r.directorPhone,
    geoLink: r.geoLink,
    note: r.note,
    certUrl: docUrl(r.certificatePath),
    docUrl: docUrl(r.documentPath),
    byName: r.byUserId ? nameById.get(r.byUserId) ?? null : null,
    connectedByName: r.connectedById ? nameById.get(r.connectedById) ?? null : null,
    connectedAt: r.connectedAt ? r.connectedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const connectedCount = items.filter((i) => i.status === "CONNECTED").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Soliqqa ulash</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isManager
            ? "Yuborilgan arizalarni ko'ring va ulangach «Ulandi» deb belgilang."
            : "O'zingiz yuborgan soliqqa ulash arizalari va ularning holati."}
          {" "}Kutilmoqda: {pendingCount} · Ulangan: {connectedCount}
        </p>
      </div>
      <SoliqQueue items={items} canManage={isManager} />
    </div>
  );
}

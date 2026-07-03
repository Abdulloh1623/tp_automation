import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseRegions } from "@/lib/constants";
import {
  EscalationList,
  type EscalatedItem,
  type ForwardedItem,
  type UstaOption,
} from "@/components/escalation-list";

export default async function EscalationPage() {
  const session = await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);

  const [clients, forwardedRaw, ustalarFull] = await Promise.all([
    db.client.findMany({
      where: { stage: "ESCALATED" },
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { name: true } },
        callLogs: {
          orderBy: { calledAt: "desc" },
          take: 1,
          select: { note: true, operator: { select: { name: true } } },
        },
      },
    }),
    db.client.findMany({
      where: { stage: "FORWARDED" },
      orderBy: { updatedAt: "desc" },
      include: { assignedUsta: { select: { name: true, phone: true } } },
    }),
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, region: true, regions: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const escalated: EscalatedItem[] = clients.map((c) => {
    const suggested = c.region
      ? (ustalarFull.find((u) =>
          parseRegions(u.regions, u.region).includes(c.region as string),
        ) ?? null)
      : null;
    return {
      id: c.id,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      phone: c.phone,
      region: c.region,
      operatorName: c.assignedTo?.name ?? null,
      missedCallCount: c.missedCallCount,
      specialNote: c.specialNote,
      lastNote: c.callLogs[0]?.note ?? null,
      suggestedUstaId: suggested?.id ?? null,
    };
  });

  const forwarded: ForwardedItem[] = forwardedRaw.map((c) => ({
    id: c.id,
    restaurantName: c.restaurantName,
    fullName: c.fullName,
    phone: c.phone,
    region: c.region,
    ustaName: c.assignedUsta?.name ?? null,
    ustaPhone: c.assignedUsta?.phone ?? null,
    ustaStatus: c.ustaStatus,
  }));

  const ustalar: UstaOption[] = ustalarFull.map((u) => ({
    id: u.id,
    name: u.name,
    region: u.region,
    regions: u.regions,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Eskalatsiya navbati
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isManager
            ? `${clients.length} ta lid ustaga biriktirishni kutmoqda — keyingi kuzatuvni TP xodimlari olib boradi`
            : `Ustadagi ishlarni kuzating: usta bilan bog'laning va holatni yangilang. Biriktirish kutilmoqda: ${clients.length}`}
        </p>
      </div>
      <EscalationList
        escalated={escalated}
        forwarded={forwarded}
        ustalar={ustalar}
        isManager={isManager}
      />
    </div>
  );
}

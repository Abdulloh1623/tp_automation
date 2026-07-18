import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseRegions } from "@/lib/constants";
import {
  EscalationList,
  type EscalatedItem,
  type ForwardedItem,
  type ResolvedItem,
  type UstaOption,
} from "@/components/escalation-list";
import { type StaffOption } from "@/components/assign-escalation-staff";
import { CountStrip, type CountItem } from "@/components/count-strip";
import { slaThreshold } from "@/lib/sla";
import { assignedStaffScope } from "@/lib/visibility";

// "Yakunlangan" bo'limi uchun serverdan olinadigan maksimal (yaqin) yozuv.
// Sana filtri va "yana ko'rsatish" shu to'plam ustidan mijoz tomonida ishlaydi.
const RESOLVED_FETCH_CAP = 200;

export default async function EscalationPage() {
  const session = await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);
  // TP xodim (OPERATOR) faqat o'ziga maxsus xodim qilib biriktirilgan
  // eskalatsiyalarni ko'radi; ADMIN/MANAGER esa barchasini (va biriktiradi).
  const scope = assignedStaffScope(session.role, session.userId, "escalationStaffId");
  const overdueBefore = slaThreshold();
  // Eskalatsiya SLA soati — escalatedAt (bo'lmasa updatedAt) shu vaqtdan oldingi bo'lsa buzilgan
  const isOverdue = (escalatedAt: Date | null, updatedAt: Date) =>
    (escalatedAt ?? updatedAt) < overdueBefore;

  const staffInclude = { escalationStaff: { select: { id: true, name: true } } };

  const [clients, forwardedRaw, resolvedRaw, ustalarFull, xodimlarFull] = await Promise.all([
    db.client.findMany({
      where: { stage: "ESCALATED", ...scope },
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { name: true } },
        ...staffInclude,
        callLogs: {
          orderBy: { calledAt: "desc" },
          take: 1,
          select: { note: true, operator: { select: { name: true } } },
        },
      },
    }),
    db.client.findMany({
      where: { stage: "FORWARDED", ...scope },
      orderBy: { updatedAt: "desc" },
      include: { assignedUsta: { select: { name: true, phone: true } }, ...staffInclude },
    }),
    // Yakunlangan eskalatsiyalar — usta "Bajarildi" degach stage RESOLVED bo'ladi
    // va eskalatsiya belgilari (escalatedAt/escalationStaffId) tozalanadi. Boshliq
    // barchasini, operator esa faqat o'zi yakunlaganini (DONE izohi o'ziniki) ko'radi.
    db.client.findMany({
      where: {
        stage: "RESOLVED",
        ustaStatus: "DONE",
        ...(isManager
          ? {}
          : { callLogs: { some: { result: "DONE", operatorId: session.userId } } }),
      },
      orderBy: { updatedAt: "desc" },
      take: RESOLVED_FETCH_CAP,
      include: {
        assignedTo: { select: { name: true } },
        assignedUsta: { select: { name: true, phone: true } },
      },
    }),
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, region: true, regions: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "OPERATOR"] }, isActive: true },
      select: { id: true, name: true },
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
      staffId: c.escalationStaff?.id ?? null,
      staffName: c.escalationStaff?.name ?? null,
      overdue: isOverdue(c.escalatedAt, c.updatedAt),
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
    staffId: c.escalationStaff?.id ?? null,
    staffName: c.escalationStaff?.name ?? null,
    overdue: isOverdue(c.escalatedAt, c.updatedAt),
  }));

  const resolved: ResolvedItem[] = resolvedRaw.map((c) => ({
    id: c.id,
    restaurantName: c.restaurantName,
    fullName: c.fullName,
    phone: c.phone,
    region: c.region,
    ustaName: c.assignedUsta?.name ?? null,
    ustaPhone: c.assignedUsta?.phone ?? null,
    operatorName: c.assignedTo?.name ?? null,
    resolvedAt: c.updatedAt.toISOString(),
  }));

  const ustalar: UstaOption[] = ustalarFull.map((u) => ({
    id: u.id,
    name: u.name,
    region: u.region,
    regions: u.regions,
  }));

  const staffOptions: StaffOption[] = xodimlarFull.map((u) => ({ id: u.id, name: u.name }));

  const overdueCount =
    escalated.filter((c) => c.overdue).length + forwarded.filter((c) => c.overdue).length;
  // FORWARDED ichida: usta endigina biriktirilgan (ASSIGNED) va ish boshlaganlar.
  const biriktirildiCount = forwarded.filter(
    (c) => (c.ustaStatus ?? "ASSIGNED") === "ASSIGNED",
  ).length;
  const summary: CountItem[] = [
    { label: "Yangi (navbatda)", value: escalated.length, tone: "red" },
    { label: "Biriktirildi", value: biriktirildiCount, tone: "amber" },
    { label: "Jarayonda", value: forwarded.length - biriktirildiCount, tone: "sky" },
    { label: "Yakunlangan", value: resolved.length, tone: "emerald" },
    { label: "3 kundan oshgan", value: overdueCount, tone: "red" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Eskalatsiya navbati
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isManager
            ? `${clients.length} ta lid ustaga biriktirishni kutmoqda — keyingi kuzatuvni TP xodimlari olib boradi`
            : `Sizga biriktirilgan eskalatsiyalar — usta va mijoz bilan bog'lanib yakuniga yetkazing (navbatda: ${clients.length})`}
        </p>
        <div className="mt-3">
          <CountStrip items={summary} />
        </div>
      </div>
      <EscalationList
        escalated={escalated}
        forwarded={forwarded}
        resolved={resolved}
        ustalar={ustalar}
        staffOptions={staffOptions}
        isManager={isManager}
      />
    </div>
  );
}

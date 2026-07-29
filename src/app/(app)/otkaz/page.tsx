import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { RefusedList, type RefusedItem } from "@/components/refused-list";
import { formatDateTime } from "@/lib/utils";
import { resolveClientUsta } from "@/lib/usta-region";
import { expectedRentalValue } from "@/lib/inventory-stats";

export default async function RefusedPage() {
  const session = await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  // Operator faqat ko'radi (telefon/izoh) — orqaga qaytarish boshliqda
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);

  const [clients, ustalar] = await Promise.all([
    db.client.findMany({
      where: { stage: "REFUSED" },
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { name: true } },
        assignedUsta: { select: { name: true } },
        specialNoteBy: { select: { name: true } },
        callLogs: {
          orderBy: { calledAt: "desc" },
          take: 1,
          select: { note: true, calledAt: true, operator: { select: { name: true } } },
        },
      },
    }),
    // Faolsiz usta ham kerak — eski biriktiruvlar unga bog'liq bo'lishi mumkin.
    db.user.findMany({
      where: { role: "INSTALLER" },
      select: { id: true, name: true, region: true, regions: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const items: RefusedItem[] = clients.map((c) => {
    const last = c.callLogs[0];
    const usta = resolveClientUsta(
      {
        region: c.region,
        assignedUstaId: c.assignedUstaId,
        assignedUstaName: c.assignedUsta?.name ?? null,
      },
      ustalar,
    );
    return {
      id: c.id,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      phone: c.phone,
      region: c.region,
      operatorName: c.assignedTo?.name ?? null,
      monthlyAmount: c.monthlyAmount,
      currency: c.currency,
      rentalValue: expectedRentalValue(c.monthlyAmount, c.currency),
      ustaId: usta.ustaId,
      ustaName: usta.ustaName,
      ustaByRegion: usta.byRegion,
      lastNote: last?.note ?? null,
      lastNoteBy: last?.operator?.name ?? null,
      lastNoteAtFmt: last ? formatDateTime(last.calledAt) : null,
      specialNote: c.specialNote,
      specialNoteBy: c.specialNoteBy?.name ?? null,
      specialNoteAt: c.specialNoteAt ? c.specialNoteAt.toISOString() : null,
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Otkaz — bekor qilgan mijozlar
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {clients.length} ta mijoz xizmatdan voz kechgan
        </p>
      </div>
      <RefusedList
        items={items}
        isManager={isManager}
        ustalar={ustalar.map((u) => ({ id: u.id, name: u.name }))}
      />
    </div>
  );
}

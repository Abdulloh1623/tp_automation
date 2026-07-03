import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { RefusedList, type RefusedItem } from "@/components/refused-list";
import { formatDateTime } from "@/lib/utils";

export default async function RefusedPage() {
  const session = await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  // Operator faqat ko'radi (telefon/izoh) — orqaga qaytarish boshliqda
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);

  const clients = await db.client.findMany({
    where: { stage: "REFUSED" },
    orderBy: { updatedAt: "desc" },
    include: {
      assignedTo: { select: { name: true } },
      callLogs: {
        orderBy: { calledAt: "desc" },
        take: 1,
        select: { note: true, calledAt: true, operator: { select: { name: true } } },
      },
    },
  });

  const items: RefusedItem[] = clients.map((c) => {
    const last = c.callLogs[0];
    return {
      id: c.id,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      phone: c.phone,
      region: c.region,
      operatorName: c.assignedTo?.name ?? null,
      lastNote: last?.note ?? null,
      lastNoteBy: last?.operator?.name ?? null,
      lastNoteAtFmt: last ? formatDateTime(last.calledAt) : null,
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
      <RefusedList items={items} isManager={isManager} />
    </div>
  );
}

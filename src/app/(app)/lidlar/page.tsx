import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LeadTable, type LeadRow, type LeadHistory } from "@/components/lead-table";
import { ACTIVE_STAGES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type SearchParams = Promise<{ operator?: string }>;

const TODAY = new Date().toISOString().slice(0, 10);

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const { operator } = await searchParams;
  const isAdmin = session.role === "ADMIN";
  const viewerId = isAdmin && operator ? operator : session.userId;
  const today = endOfDay(new Date());
  const todayStart = startOfDay(new Date());

  const [leadsRaw, operators] = await Promise.all([
    db.client.findMany({
      where: {
        assignedToId: viewerId,
        OR: [
          // Kunlik ish ro'yxati (faol bo'limlar, muddati kelgan)
          {
            stage: { in: [...ACTIVE_STAGES] },
            OR: [
              { pendingStage: { not: null } },
              { nextContactDate: null },
              { nextContactDate: { lte: today } },
            ],
          },
          // Qarzdorlar — to'lov muddati o'tgan faol mijozlar (bo'limidan qat'i nazar)
          { status: "ACTIVE", nextPaymentDate: { lt: todayStart } },
        ],
      },
      orderBy: [{ nextContactDate: "asc" }, { restaurantName: "asc" }],
      include: {
        specialNoteBy: { select: { name: true } },
        callLogs: {
          orderBy: { calledAt: "desc" },
          take: 60,
          select: {
            calledAt: true,
            result: true,
            note: true,
            operator: { select: { name: true } },
          },
        },
      },
    }),
    isAdmin
      ? db.user.findMany({
          where: { role: { in: ["OPERATOR", "ADMIN"] }, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const leads: LeadRow[] = leadsRaw.map((c) => {
    // Kun bo'yicha eng so'nggi yozuv (bir kun = bir katak)
    const byDay = new Map<string, LeadHistory>();
    for (const l of c.callLogs) {
      const date = l.calledAt.toISOString().slice(0, 10);
      if (!byDay.has(date)) {
        byDay.set(date, {
          date,
          result: l.result,
          note: l.note,
          operator: l.operator?.name ?? null,
        });
      }
    }
    const history = [...byDay.values()];
    const todayEntry = byDay.get(TODAY) ?? null;

    const overdue =
      c.status === "ACTIVE" && !!c.nextPaymentDate && c.nextPaymentDate < todayStart;
    const overdueDays = overdue
      ? Math.floor((todayStart.getTime() - c.nextPaymentDate!.getTime()) / 86400000)
      : 0;

    return {
      id: c.id,
      overdue,
      overdueDays,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      region: c.region,
      phone: c.phone,
      monthlyAmount: c.monthlyAmount,
      currency: c.currency,
      nextPaymentDate: c.nextPaymentDate ? c.nextPaymentDate.toISOString() : null,
      stage: c.stage,
      pendingStage: c.pendingStage,
      lastContactedAt: c.lastContactedAt ? c.lastContactedAt.toISOString() : null,
      missedCallCount: c.missedCallCount,
      specialNote: c.specialNote,
      specialNoteBy: c.specialNoteBy?.name ?? null,
      specialNoteAt: c.specialNoteAt ? c.specialNoteAt.toISOString() : null,
      todayOutcome: todayEntry?.result ?? null,
      todayNote: todayEntry?.note ?? null,
      history,
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Kunlik ish</h1>
          <p className="text-sm text-slate-500">
            {formatDate(new Date())} · {leads.length} ta lid
          </p>
        </div>
      </div>

      {isAdmin && (
        <Card className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="w-56">
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Operator board'i
              </label>
              <Select name="operator" defaultValue={viewerId}>
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="outline">
              Ko'rish
            </Button>
          </form>
        </Card>
      )}

      <LeadTable leads={leads} />
    </div>
  );
}

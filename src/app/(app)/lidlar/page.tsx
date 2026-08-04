import { endOfDay, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LeadTable, type LeadRow, type LeadHistory } from "@/components/lead-table";
import { OperatorProgress } from "@/components/operator-progress";
import { getOperatorDailyStats } from "@/lib/analytics";
import { ACTIVE_STAGES, NO_CONTACT_STAGES, OFF_BOARD_STAGES, profileOrder } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { tzDayKey, startOfTzDay } from "@/lib/tz";
import { getActiveLeadProfile } from "@/lib/settings";
import { classifyLead, isFloorLead } from "@/lib/lead-segments";
import { LeadFocusCard } from "@/components/lead-focus-card";
import { DutyCheckIn } from "@/components/duty-checkin";
import { isDutyRotationDay } from "@/lib/shift";

type SearchParams = Promise<{ operator?: string }>;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const { operator } = await searchParams;
  const isAdmin = session.role === "ADMIN";
  const viewerId = isAdmin && operator ? operator : session.userId;
  const now = new Date();
  const today = endOfDay(now);
  const todayStart = startOfDay(now);
  // Bugun — Toshkent (UTC+5) taqvim kuni, so'rov paytida hisoblanadi (modul
  // darajasida EMAS — aks holda server jarayonida sana "muzlab" qolardi).
  const todayKey = tzDayKey(new Date());

  const [leadsRaw, operators, dailyStats, focus] = await Promise.all([
    db.client.findMany({
      where: {
        assignedToId: viewerId,
        // Otkaz qilingan / o'chirilgan / nofaol mijozlar kunlik taxtaga hech qachon
        // chiqmaydi — qarzdor bo'lsa ham (ular bilan qayta aloqaga chiqilmaydi).
        // OFF_BOARD_STAGES (eskalatsiya/qaytarish/muammo) ham xuddi shunday —
        // boshqa jarayonda, qarzdor bo'lsa ham ro'yxatga sizib chiqmasin.
        stage: { notIn: [...NO_CONTACT_STAGES, ...OFF_BOARD_STAGES] },
        status: { not: "INACTIVE" },
        // Bugun "otkaz"/"o'chirildi" deb belgilangan (pendingStage) lidlar ham
        // darhol taxtadan chiqadi — kun yakunida rasmiy stage'ga o'tadi. Undefined/
        // null pendingStage'li (odatdagi) lidlar qoladi. (Prisma notIn null'ni
        // chiqarib yubormasligi uchun aniq OR bilan yozamiz.)
        AND: [
          {
            OR: [
              { pendingStage: null },
              { pendingStage: { notIn: [...NO_CONTACT_STAGES] } },
            ],
          },
        ],
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
    getOperatorDailyStats(viewerId),
    getActiveLeadProfile(),
  ]);

  // Navbat kuni (yakshanba) — ro'yxat oldindan bo'linmaydi, operator o'zi
  // "Bugun ishdaman" deydi. Faqat operatorga ko'rsatiladi: admin boshqa odamning
  // board'ini ko'rayotgan bo'lsa, uning nomidan ishga chiqib bo'lmaydi.
  const dutyDay = isDutyRotationDay(now) && session.role === "OPERATOR";
  const dutyRows = dutyDay
    ? await db.dutyDay.findMany({
        where: { date: startOfTzDay(0) },
        select: { userId: true, user: { select: { name: true } } },
      })
    : [];

  // Kunlik fokus board'ni ham tartiblaydi: ustuvorlik faqat "kimga tegdi"ni emas,
  // "kim birinchi qo'ng'iroq qilinadi"ni ham belgilashi kerak.
  const order = profileOrder(focus.id);
  const segmentRank = new Map(order.map((s, i) => [s.segment, i]));

  // "To'lov qiladi" degan mijozdan bugun chek kelganmi — taxtadagi belgi shunga
  // qarab o'chadi (kun oxirida chek bo'lmasa sana ertangi kunga suriladi).
  const paidTodayRows = leadsRaw.length
    ? await db.payment.findMany({
        where: { paidAt: { gte: todayStart }, clientId: { in: leadsRaw.map((c) => c.id) } },
        select: { clientId: true },
        distinct: ["clientId"],
      })
    : [];
  const paidToday = new Set(paidTodayRows.map((p) => p.clientId));

  const leads: LeadRow[] = leadsRaw.map((c) => {
    // Kun bo'yicha eng so'nggi yozuv (bir kun = bir katak)
    const byDay = new Map<string, LeadHistory>();
    for (const l of c.callLogs) {
      const date = tzDayKey(l.calledAt);
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
    const todayEntry = byDay.get(todayKey) ?? null;

    const overdue =
      c.status === "ACTIVE" && !!c.nextPaymentDate && c.nextPaymentDate < todayStart;
    const overdueDays = overdue
      ? Math.floor((todayStart.getTime() - c.nextPaymentDate!.getTime()) / 86400000)
      : 0;

    return {
      id: c.id,
      segment: classifyLead(c, order, now),
      mustCall: isFloorLead(c, now),
      // Bugun "to'lov qiladi" deyilgan, ammo chek hali kelmagan
      awaitingReceipt: todayEntry?.result === "WILL_PAY" && !paidToday.has(c.id),
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

  // Ustuvorlik tartibi: majburiy (bugunga va'da / eski qarz) → fokus segmenti →
  // qayta-aloqa sanasi. Operator ro'yxatni tepadan bosgani ma'qul.
  leads.sort((a, b) => {
    if (a.mustCall !== b.mustCall) return a.mustCall ? -1 : 1;
    const ra = segmentRank.get(a.segment) ?? order.length;
    const rb = segmentRank.get(b.segment) ?? order.length;
    if (ra !== rb) return ra - rb;
    const da = a.nextPaymentDate ?? "";
    const db_ = b.nextPaymentDate ?? "";
    if (da !== db_) return da < db_ ? -1 : 1;
    return a.restaurantName.localeCompare(b.restaurantName);
  });

  // Kunlik lid va qarzdorni ajratib ko'rsatamiz — jami son (75-100) chalg'ituvchi
  // edi (u kunlik lid + muddati o'tgan qarzdorlarni birga sanardi).
  const overdueCount = leads.filter((l) => l.overdue).length;
  const lidCount = leads.length - overdueCount;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Kunlik ish</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatDate(new Date())} · {lidCount} ta lid
            {overdueCount > 0 && ` · ${overdueCount} qarzdor`}
          </p>
        </div>
      </div>

      {dutyDay && (
        <DutyCheckIn
          checkedIn={dutyRows.some((d) => d.userId === session.userId)}
          onDuty={dutyRows.map((d) => d.user.name)}
        />
      )}

      <LeadFocusCard profile={focus.id} todayOnly={focus.todayOnly} canEdit={isAdmin} />

      <OperatorProgress initial={dailyStats} />

      {isAdmin && (
        <Card className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="w-56">
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
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

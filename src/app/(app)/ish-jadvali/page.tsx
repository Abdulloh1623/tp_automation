import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { RosterForm, type RosterRow } from "@/components/roster-form";
import { startOfTzDay, tzDayKey, tzDayStartFromInput, tzDateLabel } from "@/lib/tz";
import type { UserShift } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ish jadvali" };

type SearchParams = Promise<{ date?: string }>;

export default async function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["ADMIN"]);
  const { date: dateParam } = await searchParams;

  const todayKey = tzDayKey(startOfTzDay(0));
  const tomorrowKey = tzDayKey(startOfTzDay(-1));
  const dateKey = dateParam && tzDayStartFromInput(dateParam) ? dateParam : tomorrowKey;
  const date = tzDayStartFromInput(dateKey)!;

  const [operators, roster] = await Promise.all([
    db.user.findMany({
      where: { role: "OPERATOR", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, shift: true },
    }),
    db.dutyDay.findMany({ where: { date }, select: { userId: true, shift: true } }),
  ]);

  const rosterMap = new Map(roster.map((r) => [r.userId, r.shift]));
  const initialRows: RosterRow[] = operators.map((o) => {
    const assigned = rosterMap.get(o.id);
    return {
      id: o.id,
      name: o.name,
      onDuty: assigned !== undefined,
      shift: ((assigned ?? o.shift) === "NIGHT" ? "NIGHT" : "DAY") as UserShift,
    };
  });

  const prevKey = tzDayKey(new Date(date.getTime() - 86400000));
  const nextKey = tzDayKey(new Date(date.getTime() + 86400000));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Ish jadvali</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Kim ishlaydi va qaysi smenada — kunlik lid taqsimoti (cron 08:00/18:00)
          shu jadval bo'yicha ishlaydi. Odatda ertangi kun uchun bir kun oldin
          to'ldiriladi.
        </p>
      </div>

      <RosterForm
        key={dateKey}
        dateKey={dateKey}
        initialRows={initialRows}
        nav={{ prevKey, nextKey, todayKey, tomorrowKey, label: tzDateLabel(date) }}
      />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";
import {
  User as UserIcon,
  Phone,
  MapPin,
  Shield,
  PhoneCall,
  MessageCircle,
  Banknote,
  CheckCircle2,
  Wrench,
} from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfilePasswordForm } from "@/components/profile-password-form";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketTypeBadge,
} from "@/components/status-badge";
import { TALKED_RESULTS } from "@/lib/constants";
import { MyWeekCalls } from "@/components/my-week-calls";
import { groupCallsByDay, WEEK_CALLS_DAYS } from "@/lib/week-calls";
import { startOfTzDay } from "@/lib/tz";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Menejer",
  OPERATOR: "Operator",
  INSTALLER: "Usta",
};

// Bir davr (bugun/hafta/oy) uchun xodim natijalari
type PeriodStats = {
  calls: number; // yozilgan qo'ng'iroq natijalari
  talked: number; // haqiqiy gaplashuvlar (TALKED_RESULTS)
  resolved: number; // "hal qilindi / muammo yo'q" natijalari
  payments: number; // qabul qilingan to'lovlar soni
  sums: Map<string, number>; // valyuta bo'yicha yig'ilgan summa
};

function emptyStats(): PeriodStats {
  return { calls: 0, talked: 0, resolved: 0, payments: 0, sums: new Map() };
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pending = await db.passwordResetRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  // --- Mening natijalarim: bugun / shu hafta / shu oy ---
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  // hafta boshi oy boshidan oldin bo'lishi mumkin — eng ertasidan o'qiymiz
  const since = weekStart < monthStart ? weekStart : monthStart;

  // Kunlik ro'yxat oynasi: bugun + oldingi 6 kun (UTC+5 kun boshidan).
  const weekCallsFrom = startOfTzDay(WEEK_CALLS_DAYS - 1);

  const [myCalls, myPayments, myTickets, myWeekCalls] = await Promise.all([
    db.callLog.findMany({
      where: { operatorId: user.id, calledAt: { gte: since } },
      select: { calledAt: true, result: true },
    }),
    db.payment.findMany({
      where: { recordedById: user.id, createdAt: { gte: since } },
      select: { createdAt: true, amount: true, currency: true },
    }),
    // Menga (mas'ul xodim) biriktirilgan hal bo'lmagan muammolar.
    db.ticket.findMany({
      where: { assignedStaffId: user.id, status: { not: "RESOLVED" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        createdAt: true,
        client: { select: { id: true, restaurantName: true } },
      },
    }),
    // Oxirgi 7 kunlik qo'ng'iroqlarim — kun bo'yicha ro'yxat uchun.
    // Kunlik chegara: 7 kun × ~100 qo'ng'iroq dan oshmaydi, ortiq yozuv
    // ro'yxat sifatida baribir o'qilmaydi.
    db.callLog.findMany({
      where: { operatorId: user.id, calledAt: { gte: weekCallsFrom } },
      orderBy: { calledAt: "desc" },
      take: 700,
      select: {
        calledAt: true,
        result: true,
        note: true,
        client: {
          select: { id: true, restaurantName: true, fullName: true, phone: true },
        },
      },
    }),
  ]);

  const weekDays = groupCallsByDay(
    myWeekCalls.map((c) => ({
      clientId: c.client.id,
      restaurantName: c.client.restaurantName,
      fullName: c.client.fullName,
      phone: c.client.phone,
      calledAt: c.calledAt,
      result: c.result,
      note: c.note,
    })),
  );
  const weekLeadCount = weekDays.reduce((n, d) => n + d.leads, 0);
  // Operatorga ro'yxat DOIM ko'rinadi (bo'sh hafta ham ma'lumot); boshqa
  // rollarga esa faqat qo'ng'iroq yozuvi bo'lsa — aks holda quruq karta.
  const showWeekCalls = user.role === "OPERATOR" || weekLeadCount > 0;

  const periods: { key: string; label: string; from: Date; stats: PeriodStats }[] = [
    { key: "day", label: "Bugun", from: dayStart, stats: emptyStats() },
    { key: "week", label: "Shu hafta", from: weekStart, stats: emptyStats() },
    { key: "month", label: "Shu oy", from: monthStart, stats: emptyStats() },
  ];

  for (const c of myCalls) {
    for (const p of periods) {
      if (c.calledAt < p.from) continue;
      p.stats.calls += 1;
      if (TALKED_RESULTS.includes(c.result)) p.stats.talked += 1;
      if (c.result === "RESOLVED" || c.result === "NO_PROBLEM") p.stats.resolved += 1;
    }
  }
  for (const pay of myPayments) {
    for (const p of periods) {
      if (pay.createdAt < p.from) continue;
      p.stats.payments += 1;
      p.stats.sums.set(pay.currency, (p.stats.sums.get(pay.currency) ?? 0) + pay.amount);
    }
  }

  const sumLabel = (sums: Map<string, number>) =>
    sums.size === 0
      ? "—"
      : [...sums.entries()].map(([cur, sum]) => formatMoney(sum, cur)).join(" + ");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Mening profilim</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Shaxsiy ma'lumotlar va parolni tiklash
        </p>
      </div>

      {/* Mening natijalarim — xodim o'z ish natijalarini ko'radi */}
      <Card>
        <CardHeader>
          <CardTitle>Mening natijalarim</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Davr</th>
                  <th className="py-2 pr-3 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <PhoneCall className="h-3.5 w-3.5" /> Qo'ng'iroqlar
                    </span>
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" /> Gaplashildi
                    </span>
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Hal qilindi
                    </span>
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Banknote className="h-3.5 w-3.5" /> To'lovlar
                    </span>
                  </th>
                  <th className="py-2 font-medium">Summa</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr
                    key={p.key}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <td className="py-2.5 pr-3 font-medium text-slate-700 dark:text-slate-200">
                      {p.label}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {p.stats.calls}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {p.stats.talked}
                    </td>
                    <td className="py-2.5 pr-3 text-emerald-700 dark:text-emerald-300">
                      {p.stats.resolved}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {p.stats.payments}
                    </td>
                    <td className="py-2.5 font-medium text-slate-800 dark:text-slate-100">
                      {sumLabel(p.stats.sums)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Oxirgi 7 kun — har bir kun uchun o'zim gaplashgan lidlar ro'yxati */}
      {showWeekCalls && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <PhoneCall className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  Men gaplashgan lidlar
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {weekLeadCount}
                  </span>
                </span>
              </CardTitle>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                oxirgi {WEEK_CALLS_DAYS} kun · kunni bosing
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {weekLeadCount === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Oxirgi {WEEK_CALLS_DAYS} kunda qo'ng'iroq yozuvi yo'q.
              </p>
            ) : (
              <MyWeekCalls days={weekDays} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Menga biriktirilgan muammolar — admin/menejer biriktirgach shu yerda ko'rinadi */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Wrench className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                Menga biriktirilgan muammolar
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {myTickets.length}
                </span>
              </span>
            </CardTitle>
            {myTickets.length > 0 && (
              <Link
                href="/muammolar"
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700"
              >
                Barchasi →
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {myTickets.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Sizga biriktirilgan hal qilinmagan muammo yo'q.
            </p>
          ) : (
            <div className="space-y-2">
              {myTickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/mijozlar/${t.client.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-primary-300 dark:border-slate-800 dark:hover:border-primary-700"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {t.title}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {t.client.restaurantName} · {formatDate(t.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TicketTypeBadge type={t.type} />
                    <TicketPriorityBadge priority={t.priority} />
                    <TicketStatusBadge status={t.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ma'lumotlar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={UserIcon} label="Ism" value={user.name} />
            <Row icon={Shield} label="Login" value={user.username} />
            <Row icon={Shield} label="Rol" value={ROLE_LABEL[user.role] ?? user.role} />
            <Row icon={Phone} label="Telefon" value={user.phone ?? "—"} />
            <Row icon={MapPin} label="Viloyat" value={user.region ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parolni tiklash</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfilePasswordForm
              hasPending={!!pending}
              requestedAt={pending ? formatDateTime(pending.createdAt) : undefined}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      <span className="w-20 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

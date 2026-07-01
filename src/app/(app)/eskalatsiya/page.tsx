import { Phone, PhoneOff, MapPin, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { AssignUstaForm } from "@/components/assign-usta-form";
import { UstaStatusControl } from "@/components/usta-status-control";
import { LeadRevertButton } from "@/components/lead-revert-button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { parseRegions, ustaStatusLabel } from "@/lib/constants";
import { formatPhone, normalizePhone } from "@/lib/utils";

export default async function EscalationPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const [clients, forwarded, ustalar] = await Promise.all([
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
      include: { assignedUsta: { select: { name: true } } },
    }),
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, region: true, regions: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Eskalatsiya navbati
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {clients.length} ta lid ustaga biriktirishni kutmoqda
        </p>
      </div>

      {clients.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Navbat bo'sh — eskalatsiya qilingan lid yo'q
        </Card>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => {
            const suggested = c.region
              ? (ustalar.find((u) =>
                  parseRegions(u.regions, u.region).includes(c.region as string),
                ) ?? null)
              : null;
            const lastNote = c.callLogs[0]?.note ?? null;
            return (
              <Card key={c.id}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {c.restaurantName}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>{c.fullName}</span>
                        {c.region && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {c.region}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <a
                            href={`tel:${normalizePhone(c.phone)}`}
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"
                          >
                            <Phone className="h-3 w-3" />
                            {formatPhone(c.phone)}
                          </a>
                          <PhoneCopyButton phone={c.phone} />
                        </span>
                        {c.assignedTo && <span>· operator: {c.assignedTo.name}</span>}
                      </div>
                    </div>
                    {c.missedCallCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                        <PhoneOff className="h-3 w-3" />
                        {c.missedCallCount} marta ko'tarilmagan
                      </span>
                    )}
                  </div>

                  {(c.specialNote || lastNote) && (
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-sm text-slate-600 dark:text-slate-300">
                      {c.specialNote && (
                        <div className="text-amber-800 dark:text-amber-300">
                          Maxsus: {c.specialNote}
                        </div>
                      )}
                      {lastNote && <div>Oxirgi izoh: {lastNote}</div>}
                    </div>
                  )}

                  <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <AssignUstaForm
                      clientId={c.id}
                      ustalar={ustalar}
                      suggestedUstaId={suggested?.id ?? null}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Noto'g'ri yo'naltirilgan bo'lsa:
                      </span>
                      <LeadRevertButton clientId={c.id} label={c.restaurantName} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ustada (jarayonda) — boshliq usta bilan aloqada bo'lib nazorat qiladi */}
      {forwarded.length > 0 && (
        <div className="space-y-3">
          <h2 className="pt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Ustada (jarayonda) — {forwarded.length} ta
          </h2>
          {forwarded.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{c.restaurantName}</div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{c.fullName}</span>
                      {c.region && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.region}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <a
                          href={`tel:${normalizePhone(c.phone)}`}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"
                        >
                          <Phone className="h-3 w-3" />
                          {formatPhone(c.phone)}
                        </a>
                        <PhoneCopyButton phone={c.phone} />
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Wrench className="h-3 w-3" /> {c.assignedUsta?.name ?? "—"}
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    {ustaStatusLabel(c.ustaStatus ?? "ASSIGNED")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <UstaStatusControl clientId={c.id} current={c.ustaStatus} />
                  <LeadRevertButton clientId={c.id} label={c.restaurantName} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { Ban, MapPin, Phone } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { LeadRevertButton } from "@/components/lead-revert-button";
import { PhoneCopyButton } from "@/components/phone-copy";
import { formatPhone, normalizePhone, formatDateTime } from "@/lib/utils";

export default async function RefusedPage() {
  await requireRole(["ADMIN", "MANAGER"]);

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

      {clients.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Otkaz qilgan mijoz yo'q
        </Card>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => {
            const last = c.callLogs[0];
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                      <Ban className="h-3 w-3" /> Otkaz
                    </span>
                  </div>

                  {last?.note && (
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-sm text-slate-600 dark:text-slate-300">
                      Sabab: {last.note}
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {last.operator ? ` · ${last.operator.name}` : ""} · {formatDateTime(last.calledAt)}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      Mijoz qaytsa:
                    </span>
                    <LeadRevertButton clientId={c.id} label={c.restaurantName} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

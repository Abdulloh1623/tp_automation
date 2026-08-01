import Link from "next/link";
import { MapPin, Phone, Pencil, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientLink } from "@/components/client-link";
import { PhoneCopyButton } from "@/components/phone-copy";
import { DuplicateDeleteButton } from "@/components/duplicate-delete-button";
import type { DupGroup, DupReason } from "@/lib/duplicates";
import type { DupPageClient } from "@/lib/duplicates-data";
import { CLIENT_STATUS, LEAD_STAGE } from "@/lib/constants";
import { formatDate, formatMoney, formatPhone } from "@/lib/utils";

const REASON_LABEL: Record<DupReason, string> = {
  phone: "Bir xil telefon",
  contract: "Bir xil shartnoma",
  name: "Bir xil nom",
};

function statusLabel(s: string): string {
  return CLIENT_STATUS[s as keyof typeof CLIENT_STATUS] ?? s;
}
function stageLabel(s: string): string {
  return LEAD_STAGE[s as keyof typeof LEAD_STAGE] ?? s;
}

/**
 * Dublikat guruhlar ro'yxati. Sahifadan ajratilgan — "Muammoli mijozlar"
 * bo'limidagi tab ham, eski manzil ham shu bitta ko'rinishdan foydalanadi.
 */
export function DuplicateGroups({
  groups,
  canDelete,
}: {
  groups: DupGroup<DupPageClient>[];
  canDelete: boolean;
}) {
  const high = groups.filter((g) => g.confidence === "high").length;
  const medium = groups.length - high;
  const affected = groups.reduce((n, g) => n + g.clients.length, 0);

  if (groups.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Dublikat topilmadi — barcha mijozlar noyob ko&apos;rinadi.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">
          {groups.length} guruh
        </span>
        {high > 0 && (
          <span className="inline-flex items-center gap-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 px-3 py-1.5 font-medium text-amber-800 dark:text-amber-200">
            {high} yuqori ehtimol
          </span>
        )}
        {medium > 0 && (
          <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300">
            {medium} o&apos;rta ehtimol
          </span>
        )}
        <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300">
          {affected} ta yozuv
        </span>
      </div>

      {groups.map((g) => (
        <Card key={g.key}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                  (g.confidence === "high"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")
                }
              >
                {g.confidence === "high" ? "Yuqori ehtimol" : "O'rta ehtimol"}
              </span>
              {g.reasons.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                >
                  {REASON_LABEL[r]}
                </span>
              ))}
              <span className="ml-auto text-xs text-slate-400">
                {g.clients.length} ta yozuv
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {g.clients.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5"
                >
                  <div className="min-w-[180px] flex-1">
                    <ClientLink
                      id={c.id}
                      name={c.restaurantName || c.fullName || "—"}
                      className="font-medium text-slate-900 dark:text-slate-100"
                    />
                    {c.fullName && c.restaurantName && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {c.fullName}
                      </div>
                    )}
                    {c.contractNumber && (
                      <div className="text-xs text-slate-400">
                        Shartnoma: {c.contractNumber}
                      </div>
                    )}
                  </div>

                  <div className="min-w-[150px] text-sm text-slate-600 dark:text-slate-300">
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {formatPhone(c.phone)}
                        <PhoneCopyButton phone={c.phone} />
                      </span>
                    ) : (
                      <span className="text-slate-400">telefon yo&apos;q</span>
                    )}
                    {c.region && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <MapPin className="h-3 w-3" />
                        {c.region}
                      </span>
                    )}
                  </div>

                  <div className="min-w-[110px] text-sm text-slate-600 dark:text-slate-300">
                    {c.monthlyAmount > 0 ? formatMoney(c.monthlyAmount, c.currency) : "—"}
                    <div className="text-xs text-slate-400">
                      {statusLabel(c.status)} · {stageLabel(c.stage)}
                    </div>
                  </div>

                  <div className="min-w-[90px] text-xs text-slate-400">
                    {c.assignedTo?.name ?? "biriktirilmagan"}
                    <div>{formatDate(c.createdAt)}</div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/mijozlar/${c.id}/tahrir`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-3 w-3" />
                      Tahrir
                    </Link>
                    {canDelete && (
                      <DuplicateDeleteButton
                        clientId={c.id}
                        name={c.restaurantName || c.fullName || "—"}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

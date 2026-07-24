import Link from "next/link";
import { ArrowLeft, MapPin, Phone, Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { ClientLink } from "@/components/client-link";
import { PhoneCopyButton } from "@/components/phone-copy";
import { loadDuplicateGroups } from "@/lib/duplicates-data";
import type { DupReason } from "@/lib/duplicates";
import { CLIENT_STATUS, LEAD_STAGE } from "@/lib/constants";
import { formatMoney, formatPhone } from "@/lib/utils";

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

export default async function DuplicatesPage() {
  await requireRole(["ADMIN", "OPERATOR", "MANAGER"]);
  const groups = await loadDuplicateGroups();

  const high = groups.filter((g) => g.confidence === "high").length;
  const medium = groups.length - high;
  const affected = groups.reduce((n, g) => n + g.clients.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/mijozlar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-label="Mijozlarga qaytish"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Dublikat mijozlar
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bir xil telefon, shartnoma yoki nomga ega, ehtimoliy takrorlangan
            yozuvlar. Bu ro'yxat hech narsani o'chirmaydi — tekshirib, keraksiz
            nusxani qo'lda tuzating.
          </p>
        </div>
      </div>

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
            {medium} o'rta ehtimol
          </span>
        )}
        {groups.length > 0 && (
          <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300">
            {affected} ta yozuv
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500 dark:text-slate-400">
            Dublikat topilmadi — barcha mijozlar noyob ko'rinadi. 🎉
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
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
                          <span className="text-slate-400">telefon yo'q</span>
                        )}
                        {c.region && (
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                            <MapPin className="h-3 w-3" />
                            {c.region}
                          </span>
                        )}
                      </div>

                      <div className="min-w-[110px] text-sm text-slate-600 dark:text-slate-300">
                        {c.monthlyAmount > 0
                          ? formatMoney(c.monthlyAmount, c.currency)
                          : "—"}
                        <div className="text-xs text-slate-400">
                          {statusLabel(c.status)} · {stageLabel(c.stage)}
                        </div>
                      </div>

                      <div className="min-w-[90px] text-xs text-slate-400">
                        {c.assignedTo?.name ?? "biriktirilmagan"}
                        <div>
                          {new Date(c.createdAt).toLocaleDateString("uz-UZ")}
                        </div>
                      </div>

                      <Link
                        href={`/mijozlar/${c.id}/tahrir`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Pencil className="h-3 w-3" />
                        Tahrir
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

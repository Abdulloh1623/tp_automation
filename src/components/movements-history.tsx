import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { MOVEMENT_REASONS, type MovementRow } from "@/lib/movements";

export function MovementsHistory({
  rows,
  types,
  filter,
}: {
  rows: MovementRow[];
  types: { id: string; name: string }[];
  filter: { type: string; reason: string; days: string };
}) {
  const exportHref =
    "/api/export/movements?" +
    new URLSearchParams({
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.reason ? { reason: filter.reason } : {}),
      days: filter.days,
    }).toString();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Harakatlar tarixi</CardTitle>
        <a
          href={exportHref}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" /> Excel
        </a>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {/* Filtr (server GET) */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Texnika</label>
            <select
              name="movType"
              defaultValue={filter.type}
              className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
            >
              <option value="">Barchasi</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Amal turi</label>
            <select
              name="movReason"
              defaultValue={filter.reason}
              className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
            >
              <option value="">Barchasi</option>
              {MOVEMENT_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Davr</label>
            <select
              name="movDays"
              defaultValue={filter.days}
              className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
            >
              <option value="7">7 kun</option>
              <option value="30">30 kun</option>
              <option value="90">90 kun</option>
              <option value="365">1 yil</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Filtr
          </button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2.5 font-medium">Sana</th>
                <th className="px-3 py-2.5 font-medium">Texnika</th>
                <th className="px-3 py-2.5 text-center font-medium">Miqdor</th>
                <th className="px-3 py-2.5 font-medium">Qayerdan</th>
                <th className="px-3 py-2.5 font-medium">Qayerga</th>
                <th className="px-3 py-2.5 font-medium">Amal</th>
                <th className="px-3 py-2.5 font-medium">Kim</th>
                <th className="px-3 py-2.5 font-medium">Izoh</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400 dark:text-slate-500">
                    Bu davr/filtr bo'yicha harakat yo'q
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(r.date)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{r.typeName}</td>
                  <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-200">{r.quantity}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.from}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.to}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200">
                      {r.reason}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.user}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

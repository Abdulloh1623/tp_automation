import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { BackupButton } from "@/components/backup-button";
import { formatDateTime } from "@/lib/utils";

export default async function AuditPage() {
  await requireRole(["ADMIN"]);

  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Audit jurnali</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Oxirgi {logs.length} ta amal — kim, nima, qachon
          </p>
        </div>
        <BackupButton />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-medium">Vaqt</th>
                <th className="px-4 py-3 font-medium">Foydalanuvchi</th>
                <th className="px-4 py-3 font-medium">Amal</th>
                <th className="px-4 py-3 font-medium">Obyekt</th>
                <th className="px-4 py-3 font-medium">Tafsilot</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                    Jurnal bo'sh
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500 dark:text-slate-400">
                    {formatDateTime(l.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                    {l.userName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                    {l.action}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                    {l.entity ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {l.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

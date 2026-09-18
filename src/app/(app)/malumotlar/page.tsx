import { Upload, DatabaseBackup } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getMaintenance } from "@/lib/maintenance";
import { TicketTabs } from "@/components/ticket-tabs";
import { CsvImport } from "@/components/csv-import";
import { BulkUpload } from "@/components/bulk-upload";
import { BackupRestore } from "@/components/backup-restore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma'lumotlar" };

/**
 * Ma'lumotlar bilan ishlash bo'limi.
 *
 * Ichida ikki mustaqil funksiya tab sifatida turadi — loyihadagi mavjud naqsh
 * (Muammolar, Eskalatsiya, To'lovlar):
 *   - Ommaviy yuklash — mijozlar bazasini fayldan kiritish (ADMIN/SUPER_ADMIN/
 *     HEAD_OF_SUPPORT);
 *   - Backup va tiklash — bazani zaxira nusxadan qayta tiklash (FAQAT
 *     SUPER_ADMIN — eng xavfli, qaytarib bo'lmaydigan amal).
 */
export default async function MalumotlarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireRole(["ADMIN", "SUPER_ADMIN", "HEAD_OF_SUPPORT"]);
  const canRestore = session.role === "SUPER_ADMIN";
  const sp = await searchParams;
  const maintenance = canRestore ? await getMaintenance() : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Ma'lumotlar
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {canRestore
            ? "Ommaviy yuklash va zaxira nusxadan tiklash"
            : "Ommaviy yuklash — bazani zaxiradan tiklash faqat Super Admin uchun"}
        </p>
      </div>

      <TicketTabs
        initialKey={sp.tab === "backup" && canRestore ? "backup" : "yuklash"}
        tabs={[
          {
            key: "yuklash",
            label: "Ommaviy yuklash",
            icon: <Upload className="h-4 w-4" />,
            tone: "sky",
            content: (
              <div className="space-y-8">
                <BulkUpload />
                <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Boshqa fayldan (ustun moslash)
                  </h3>
                  <p className="mb-4 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Shablon emas, tashqi CSV bilan ishlash uchun — ustunlarni qo&apos;lda
                    moslaysiz. Faqat mijozlar uchun.
                  </p>
                  <CsvImport />
                </div>
              </div>
            ),
          },
          ...(canRestore
            ? [
                {
                  key: "backup",
                  label: "Backup va tiklash",
                  icon: <DatabaseBackup className="h-4 w-4" />,
                  tone: "amber" as const,
                  content: <BackupRestore maintenanceActive={maintenance?.active ?? false} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

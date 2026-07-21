import { Upload, DatabaseBackup } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getMaintenance } from "@/lib/maintenance";
import { TicketTabs } from "@/components/ticket-tabs";
import { CsvImport } from "@/components/csv-import";
import { BackupRestore } from "@/components/backup-restore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma'lumotlar" };

/**
 * Ma'lumotlar bilan ishlash bo'limi (ADMIN).
 *
 * Ichida ikki mustaqil funksiya tab sifatida turadi — loyihadagi mavjud naqsh
 * (Muammolar, Eskalatsiya, To'lovlar):
 *   - Ommaviy yuklash — mijozlar bazasini fayldan kiritish;
 *   - Backup va tiklash — bazani zaxira nusxadan qayta tiklash.
 */
export default async function MalumotlarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;
  const maintenance = await getMaintenance();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Ma'lumotlar
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ommaviy yuklash va zaxira nusxadan tiklash — faqat administrator uchun
        </p>
      </div>

      <TicketTabs
        initialKey={sp.tab === "backup" ? "backup" : "yuklash"}
        tabs={[
          {
            key: "yuklash",
            label: "Ommaviy yuklash",
            icon: <Upload className="h-4 w-4" />,
            tone: "sky",
            content: <CsvImport />,
          },
          {
            key: "backup",
            label: "Backup va tiklash",
            icon: <DatabaseBackup className="h-4 w-4" />,
            tone: "amber",
            content: <BackupRestore maintenanceActive={maintenance.active} />,
          },
        ]}
      />
    </div>
  );
}

import { ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { CsvImport } from "@/components/csv-import";

export default async function ImportPage() {
  const session = await getSession();

  if (!session || session.role !== "ADMIN") {
    return (
      <Card className="mx-auto max-w-md p-10 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-2 text-sm text-slate-500">
          Bu sahifa faqat administrator uchun
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">CSV import</h1>
        <p className="text-sm text-slate-500">
          Mijozlar bazasini CSV fayldan yuklang — ustunlarni moslang, oldindan
          ko'ring va import qiling
        </p>
      </div>
      <CsvImport />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { ClientForm } from "@/components/client-form";
import { createClient } from "@/actions/clients";

export default async function NewClientPage() {
  const operators = await db.user.findMany({
    where: { role: { in: ["OPERATOR", "ADMIN"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/mijozlar"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Mijozlar ro'yxati
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Yangi mijoz</h1>
      </div>

      <Card>
        <CardContent>
          <ClientForm
            action={createClient}
            operators={operators}
            submitLabel="Mijozni qo'shish"
          />
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { ClientForm } from "@/components/client-form";
import { updateClient } from "@/actions/clients";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client, operators] = await Promise.all([
    db.client.findUnique({
      where: { id },
      include: { phones: { orderBy: { createdAt: "asc" } } },
    }),
    db.user.findMany({
      where: { role: { in: ["OPERATOR", "ADMIN"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!client) notFound();

  const action = updateClient.bind(null, client.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/mijozlar/${client.id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Mijoz kartochkasi
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Mijozni tahrirlash
        </h1>
      </div>

      <Card>
        <CardContent>
          <ClientForm
            action={action}
            operators={operators}
            defaultValues={{
              ...client,
              phones: client.phones.map((p) => ({ label: p.label, number: p.number })),
            }}
            submitLabel="O'zgarishlarni saqlash"
          />
        </CardContent>
      </Card>
    </div>
  );
}

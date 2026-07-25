import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { ClientForm } from "@/components/client-form";
import { saveClientInline } from "@/actions/clients";

/**
 * Mijozni tahrirlash ko'rinishi — /mijozlar/[id]/tahrir sahifasi VA intercepting
 * modal (@modal) ikkalasi shu YAGONA komponentni ishlatadi (kod takrorlanmaydi,
 * xuddi ClientProfile kabi).
 *
 * `inline` (modal) rejimida: server `redirect` QILMAYDIGAN action ishlatiladi va
 * saqlangach forma modalni klient tomonda yopadi. Sahifa rejimida esa odatdagidek
 * `updateClient` server-redirect qiladi. (Modal ichidan server-redirect qilinsa,
 * u qayta intercept bo'lib "Saqlanmoqda..." holatida osilib qolardi.)
 */
export async function ClientEditView({
  id,
  inline = false,
}: {
  id: string;
  inline?: boolean;
}) {
  const [client, operators] = await Promise.all([
    // ANIQ `select` — `include` bilan butun yozuv olinardi va u pastda
    // ClientForm ("use client") ga spread qilinardi. Klient komponentga
    // uzatilgan HAMMA narsa sahifa manbasidagi RSC payload'ga tushadi, ya'ni
    // ichki ish holati (specialNote, escalationStaffId, missedCallCount,
    // biznexStatus, slaNotifiedAt...) ham ko'rinib qolardi. TypeScript spread'da
    // ortiqcha maydonni ushlamaydi — shu bois cheklovni so'rov darajasida
    // qo'yamiz: formaga faqat forma tahrirlaydigan maydonlar boradi.
    db.client.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        restaurantName: true,
        region: true,
        phone: true,
        contractNumber: true,
        contractDate: true,
        installerName: true,
        monoblokCount: true,
        equipment: true,
        status: true,
        monthlyAmount: true,
        currency: true,
        nextPaymentDate: true,
        debtAmount: true,
        notes: true,
        assignedToId: true,
        phones: {
          select: { label: true, number: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.user.findMany({
      where: { role: { in: ["OPERATOR", "ADMIN"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!client) notFound();

  // Ikkala rejim ham redirect QILMAYDIGAN action ishlatadi ({ ok: true }
  // qaytaradi) — forma natijaga ko'ra toast chiqaradi. Modal: yopiladi;
  // to'liq sahifa: mijoz profiliga o'tadi.
  const action = saveClientInline.bind(null, client.id);

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
            closeOnSuccess={inline}
            successRedirect={inline ? undefined : `/mijozlar/${client.id}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

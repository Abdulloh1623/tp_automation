import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Phone,
  FileText,
  MapPin,
  Wrench,
  User as UserIcon,
  Calendar,
  Banknote,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ClientEquipmentPanel,
  type EqItem,
  type EqTypeOpt,
} from "@/components/client-equipment-panel";
import {
  ClientStatusBadge,
  PaymentStatusBadge,
  CallResultBadge,
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketTypeBadge,
} from "@/components/status-badge";
import { CallLogForm } from "@/components/call-log-form";
import { PaymentForm } from "@/components/payment-form";
import { TicketForm } from "@/components/ticket-form";
import { TicketStatusControl } from "@/components/ticket-status-control";
import { formatDate, formatDateTime, formatMoney, formatPhone, normalizePhone } from "@/lib/utils";
import { PhoneCopyButton } from "@/components/phone-copy";

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
      <div className="min-w-0">
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-sm text-slate-800 dark:text-slate-100">{value || "—"}</div>
      </div>
    </div>
  );
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const client = await db.client.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { paidAt: "desc" }, include: { recordedBy: { select: { name: true } } } },
      callLogs: {
        orderBy: { calledAt: "desc" },
        include: { operator: { select: { name: true } } },
      },
      tickets: { orderBy: { createdAt: "desc" } },
      phones: { orderBy: { createdAt: "asc" } },
      equipmentItems: { include: { equipmentType: true } },
      returnRequests: {
        where: { status: { in: ["PENDING", "APPROVED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!client) notFound();

  // Ombordagi turlar (manager biriktirish formasi uchun)
  const typeRows = await db.equipmentType.findMany({ orderBy: { name: "asc" } });
  const whStock = await db.inventoryStock.findMany({
    where: { locationType: "WAREHOUSE" },
  });
  const whMap = new Map(whStock.map((s) => [s.equipmentTypeId, s.quantity]));
  const eqTypes: EqTypeOpt[] = typeRows.map((t) => ({
    id: t.id,
    name: t.name,
    rentalPrice: t.rentalPrice,
    salePrice: t.salePrice,
    warehouse: whMap.get(t.id) ?? 0,
  }));

  const eqItems: EqItem[] = client.equipmentItems.map((e) => ({
    id: e.id,
    name: e.equipmentType.name,
    ownership: e.ownership,
    quantity: e.quantity,
    rentalPrice: e.equipmentType.rentalPrice,
    salePrice: e.equipmentType.salePrice,
  }));

  // Oylik to'lov = monthlyAmount (mijoz to'laydigan JAMI). Uskuna ijara summasi
  // shundan qanchasi ekanini ko'rsatish uchun alohida hisoblanadi (qo'shilmaydi).
  const equipmentMonthly = eqItems
    .filter((i) => i.ownership === "RENTAL")
    .reduce((sum, i) => sum + i.rentalPrice * i.quantity, 0);
  const effectiveMonthly = client.monthlyAmount;

  const openReturn = client.returnRequests[0]
    ? { status: client.returnRequests[0].status, note: client.returnRequests[0].note }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/mijozlar"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Mijozlar ro'yxati
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {client.restaurantName}
            </h1>
            <ClientStatusBadge status={client.status} />
          </div>
          <Link href={`/mijozlar/${client.id}/tahrir`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Tahrirlash
            </Button>
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{client.fullName}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chap ustun */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Ma'lumotlar</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 sm:grid-cols-2">
              <InfoRow
                icon={Phone}
                label="Asosiy telefon"
                value={
                  <span className="inline-flex items-center gap-1">
                    <a href={`tel:${normalizePhone(client.phone)}`} className="text-blue-600 dark:text-blue-400">
                      {formatPhone(client.phone)}
                    </a>
                    <PhoneCopyButton phone={client.phone} />
                  </span>
                }
              />
              {client.phones.map((p) => (
                <InfoRow
                  key={p.id}
                  icon={Phone}
                  label={p.label}
                  value={
                    <span className="inline-flex items-center gap-1">
                      <a href={`tel:${normalizePhone(p.number)}`} className="text-blue-600 dark:text-blue-400">
                        {formatPhone(p.number)}
                      </a>
                      <PhoneCopyButton phone={p.number} />
                    </span>
                  }
                />
              ))}
              <InfoRow icon={MapPin} label="Viloyat" value={client.region} />
              <InfoRow
                icon={UserIcon}
                label="Kim o'rnatgan"
                value={client.installerName}
              />
              <InfoRow
                icon={FileText}
                label="Shartnoma raqami"
                value={client.contractNumber}
              />
              <InfoRow
                icon={Calendar}
                label="Shartnoma sanasi"
                value={formatDate(client.contractDate)}
              />
              <InfoRow
                icon={Wrench}
                label="Apparat"
                value={client.equipment}
              />
              <InfoRow
                icon={Wrench}
                label="Monoblok soni"
                value={String(client.monoblokCount)}
              />
              <InfoRow
                icon={UserIcon}
                label="Oxirgi gaplashgan operator"
                value={client.callLogs[0]?.operator?.name}
              />
              {client.notes && (
                <div className="sm:col-span-2">
                  <InfoRow icon={FileText} label="Izoh" value={client.notes} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Qo'ng'iroq jurnali</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
                <CallLogForm clientId={client.id} />
              </div>

              <div className="space-y-3">
                {client.callLogs.length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Hali qo'ng'iroq yozuvi yo'q
                  </p>
                )}
                {client.callLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0"
                  >
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CallResultBadge result={log.result} />
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {formatDateTime(log.calledAt)}
                        </span>
                        {log.operator && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            · {log.operator.name}
                          </span>
                        )}
                      </div>
                      {log.note && (
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{log.note}</p>
                      )}
                      {log.nextFollowUpDate && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Keyingi qo'ng'iroq: {formatDate(log.nextFollowUpDate)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Muammolar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
                <TicketForm clientId={client.id} />
              </div>

              <div className="space-y-3">
                {client.tickets.length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Ochiq muammo yo'q
                  </p>
                )}
                {client.tickets.map((t) => (
                  <div
                    key={t.id}
                    className="border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {t.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TicketTypeBadge type={t.type} />
                        <TicketPriorityBadge priority={t.priority} />
                        <TicketStatusBadge status={t.status} />
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {formatDate(t.createdAt)}
                    </div>
                    {t.resolutionNote && (
                      <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                        Yechim: {t.resolutionNote}
                      </div>
                    )}
                    <div className="mt-2">
                      <TicketStatusControl ticketId={t.id} status={t.status} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* O'ng ustun */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Obuna va to'lov</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Oylik to'lov
                </span>
                <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {formatMoney(client.monthlyAmount, client.currency)}
                </span>
              </div>
              {equipmentMonthly > 0 && equipmentMonthly <= client.monthlyAmount && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    shundan uskuna ijarasi
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {formatMoney(equipmentMonthly, client.currency)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">Keyingi to'lov</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {formatDate(client.nextPaymentDate)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">Holat</span>
                <PaymentStatusBadge nextPaymentDate={client.nextPaymentDate} />
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
                <PaymentForm
                  clientId={client.id}
                  defaultAmount={effectiveMonthly}
                  defaultCurrency={client.currency}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Uskunalar</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientEquipmentPanel
                clientId={client.id}
                role={session.role}
                currency={client.currency}
                items={eqItems}
                types={eqTypes}
                pendingReturn={openReturn}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>To'lov tarixi</CardTitle>
            </CardHeader>
            <CardContent>
              {client.payments.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">To'lovlar yo'q</p>
              ) : (
                <div className="space-y-3">
                  {client.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0"
                    >
                      <div className="flex items-start gap-2">
                        <Banknote className="mt-0.5 h-4 w-4 text-emerald-500" />
                        <div>
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {formatMoney(p.amount, p.currency)}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {formatDate(p.paidAt)}
                            {p.recordedBy ? ` · ${p.recordedBy.name}` : ""}
                          </div>
                          {p.receiptNote && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {p.receiptNote}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

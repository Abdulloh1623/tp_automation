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
  History,
  Ban,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getBiznexSubscription, type BiznexSubscription } from "@/lib/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ClientEquipmentPanel,
  type EqItem,
  type EqTypeOpt,
  type UstaSource,
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
import { SpecialNoteBell } from "@/components/special-note-bell";
import { ClientRefuseButton } from "@/components/client-refuse-button";
import { PaymentForm } from "@/components/payment-form";
import { PaymentHistoryActions } from "@/components/payment-history-actions";
import { TicketForm } from "@/components/ticket-form";
import { TicketStatusControl } from "@/components/ticket-status-control";
import { SoliqConnectDialog } from "@/components/soliq-connect-dialog";
import { paymentMethodLabel, TAX_CONNECTION_STATUS } from "@/lib/constants";
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

/**
 * Biznex obuna holati — mijoz sarlavhasida ko'rinadigan rangli badge. Qolgan
 * kunlar (`remainingDays`) bo'yicha shoshilinchlik darajasini rang bilan bildiradi:
 *   <= 0 / expired / inactive  → qizil  ("To'lov muddati o'tgan (Joyida emas!)")
 *   1..5 kun                   → amber  ("To'lov yaqin (X kun qoldi)")
 *   > 5 kun                    → yashil ("Faol (X kun bor)")
 */
function BiznexSubscriptionBadge({ sub }: { sub: BiznexSubscription }) {
  // Sozlanmagan/noma'lum — badge ko'rsatilmaydi. "not_found" alohida ogohlantirish
  // banneri orqali ko'rsatiladi.
  if (sub.status === "unknown" || sub.status === "not_found") return null;

  const days = sub.remainingDays;
  const base =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

  // Qizil — muddati o'tgan yoki nofaol
  if (sub.status === "expired" || sub.status === "inactive" || days <= 0) {
    return (
      <span className={`${base} bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300`}>
        <XCircle className="h-3 w-3" />
        To&apos;lov muddati o&apos;tgan (Joyida emas!)
      </span>
    );
  }

  // Amber — to'lov yaqin (1..5 kun)
  if (days <= 5) {
    return (
      <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`}>
        <AlertTriangle className="h-3 w-3" />
        To&apos;lov yaqin (<span className="font-semibold tabular-nums">{days}</span> kun qoldi)
      </span>
    );
  }

  // Yashil — faol, muddat uzoq
  return (
    <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300`}>
      <CheckCircle2 className="h-3 w-3" />
      Faol (<span className="font-semibold tabular-nums">{days}</span> kun bor)
    </span>
  );
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

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
      specialNoteBy: { select: { name: true } },
      equipmentItems: { include: { equipmentType: true } },
      returnRequests: {
        where: { status: { in: ["PENDING", "APPROVED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      taxConnections: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!client) notFound();

  // Biznex obuna holati — mijozning ASOSIY TELEFON raqami bo'yicha. Xatolik/
  // sozlanmagan bo'lsa "unknown" qaytadi (badge ko'rsatilmaydi); raqam topilmasa
  // "not_found" (ogohlantirish banneri). Sahifa render'i hech qachon buzilmaydi.
  const subscription = await getBiznexSubscription(client.phone);

  // Faoliyat jurnali — shu mijozga tegishli barcha amallar (audit)
  const activity = await db.auditLog.findMany({
    where: { entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, userName: true, detail: true, createdAt: true },
  });

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

  // Ustalar zaxirasi (o'zi olib borgan uskunalar) — o'rnatishda manba tanlash uchun.
  const [ustaUsers, ustaStockRows] = await Promise.all([
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    db.inventoryStock.findMany({
      where: { locationType: "USTA", quantity: { gt: 0 } },
      select: { locationId: true, equipmentTypeId: true, quantity: true },
    }),
  ]);
  const ustaNameById = new Map(ustaUsers.map((u) => [u.id, u.name]));
  const ustaSrcMap = new Map<string, { equipmentTypeId: string; quantity: number }[]>();
  for (const r of ustaStockRows) {
    const name = ustaNameById.get(r.locationId);
    if (!name) continue; // faqat faol ustalar
    const arr = ustaSrcMap.get(r.locationId) ?? [];
    arr.push({ equipmentTypeId: r.equipmentTypeId, quantity: r.quantity });
    ustaSrcMap.set(r.locationId, arr);
  }
  const ustaSources: UstaSource[] = [...ustaSrcMap.entries()].map(([ustaId, items]) => ({
    ustaId,
    ustaName: ustaNameById.get(ustaId)!,
    items,
  }));

  const eqItems: EqItem[] = client.equipmentItems.map((e) => ({
    id: e.id,
    name: e.equipmentType.name,
    ownership: e.ownership,
    quantity: e.quantity,
    // Biriktirishda kelishilgan narx (unitPrice) bo'lsa — o'sha; aks holda turning standarti.
    rentalPrice:
      e.ownership === "RENTAL" && e.unitPrice != null ? e.unitPrice : e.equipmentType.rentalPrice,
    salePrice:
      e.ownership === "SOLD" && e.unitPrice != null ? e.unitPrice : e.equipmentType.salePrice,
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

  const soliqDocUrl = (p: string | null) => (p ? `/api/soliq/${p.replace(/^soliq\//, "")}` : null);
  const soliq = client.taxConnections[0] ?? null;

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
            <SpecialNoteBell
              clientId={client.id}
              restaurantName={client.restaurantName || client.fullName}
              note={client.specialNote}
              noteBy={client.specialNoteBy?.name ?? null}
              noteAt={client.specialNoteAt ? client.specialNoteAt.toISOString() : null}
            />
            <ClientStatusBadge status={client.status} />
            {client.stage === "REFUSED" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                <Ban className="h-3 w-3" /> Otkaz
              </span>
            )}
            <BiznexSubscriptionBadge sub={subscription} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {client.stage !== "REFUSED" && (
              <ClientRefuseButton
                clientId={client.id}
                restaurantName={client.restaurantName}
              />
            )}
            <Link href={`/mijozlar/${client.id}/tahrir`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" />
                Tahrirlash
              </Button>
            </Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{client.fullName}</p>
      </div>

      {subscription.status === "not_found" && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/50"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-semibold">
              ⚠️ Telefon raqami Biznex tizimidan topilmadi.
            </span>{" "}
            Iltimos, raqamni tekshiring va yangilang.
            <span className="ml-1 text-amber-700/80 dark:text-amber-300/80">
              (Joriy: {formatPhone(client.phone)})
            </span>
          </div>
        </div>
      )}

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
                    <a href={`tel:${normalizePhone(client.phone)}`} className="text-primary-600 dark:text-primary-400">
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
                      <a href={`tel:${normalizePhone(p.number)}`} className="text-primary-600 dark:text-primary-400">
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

          <Card>
            <CardHeader>
              <CardTitle>Faoliyat jurnali</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Hali amal yozuvi yo'q
                </p>
              ) : (
                <div className="space-y-3">
                  {activity.map((a) => (
                    <div
                      key={a.id}
                      className="flex gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0"
                    >
                      <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {a.action}
                        </div>
                        {a.detail && (
                          <div className="text-xs text-slate-600 dark:text-slate-300">{a.detail}</div>
                        )}
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {formatDateTime(a.createdAt)}
                          {a.userName ? ` · ${a.userName}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              {client.debtAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Qarz qoldig'i</span>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {formatMoney(client.debtAmount, client.currency)}
                  </span>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
                <PaymentForm
                  clientId={client.id}
                  defaultAmount={effectiveMonthly}
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
                ustaSources={ustaSources}
                pendingReturn={openReturn}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Soliqqa ulash</CardTitle>
            </CardHeader>
            <CardContent>
              {soliq ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (soliq.status === "CONNECTED"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300")
                      }
                    >
                      {TAX_CONNECTION_STATUS[soliq.status as keyof typeof TAX_CONNECTION_STATUS] ?? soliq.status}
                    </span>
                    <Link href="/soliq" className="text-xs text-primary-600 hover:underline dark:text-primary-400">
                      Bo'limda ochish →
                    </Link>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    <span className="text-slate-500 dark:text-slate-400">Guvohnoma: </span>
                    {soliq.certificateNo}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    <span className="text-slate-500 dark:text-slate-400">Rahbar: </span>
                    {soliq.directorName} · {soliq.directorPhone}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a href={soliq.geoLink} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline dark:text-primary-400">
                      Geolokatsiya
                    </a>
                    {soliqDocUrl(soliq.certificatePath) && (
                      <a href={soliqDocUrl(soliq.certificatePath)!} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline dark:text-primary-400">
                        Guvohnoma fayli
                      </a>
                    )}
                    {soliqDocUrl(soliq.documentPath) && (
                      <a href={soliqDocUrl(soliq.documentPath)!} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline dark:text-primary-400">
                        Kadastr/ijara
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Bu mijozni soliqqa ulash uchun admin/menejerga yuboring.
                  </p>
                  <SoliqConnectDialog
                    clientId={client.id}
                    clientName={client.restaurantName || client.fullName}
                  />
                </div>
              )}
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
                          {(p.method || p.receiptNote) && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {p.method ? paymentMethodLabel(p.method) : p.receiptNote}
                            </div>
                          )}
                        </div>
                      </div>
                      <PaymentHistoryActions
                        canManage={isAdmin}
                        payment={{
                          id: p.id,
                          amount: p.amount,
                          currency: p.currency,
                          method: p.method,
                          paidAt: p.paidAt.toISOString(),
                          receiptNote: p.receiptNote,
                        }}
                      />
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

import Link from "next/link";
import { DocumentLink } from "@/components/document-link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Phone,
  PhoneCall,
  FileText,
  MapPin,
  Wrench,
  User as UserIcon,
  Calendar,
  Banknote,
  ReceiptText,
  Activity,
  History,
  Ban,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wallet,
  TrendingDown,
  ShieldCheck,
  Building2,
  Package,
  Landmark,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getBiznexSubscription, type BiznexSubscription } from "@/lib/billing";
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
import { CallLogActions } from "@/components/call-log-actions";
import { SpecialNoteBell } from "@/components/special-note-bell";
import { ClientVersionPicker } from "@/components/client-version-picker";
import { ClientRefuseButton } from "@/components/client-refuse-button";
import { PaymentForm } from "@/components/payment-form";
import { PaymentHistoryActions } from "@/components/payment-history-actions";
import { TicketForm } from "@/components/ticket-form";
import { TicketStatusControl } from "@/components/ticket-status-control";
import { SoliqConnectDialog } from "@/components/soliq-connect-dialog";
import { paymentMethodLabel, TAX_CONNECTION_STATUS } from "@/lib/constants";
import {
  cn,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  normalizePhone,
} from "@/lib/utils";
import { PhoneCopyButton } from "@/components/phone-copy";
import { CollapsibleList } from "@/components/collapsible-list";
import { ExpandableText } from "@/components/expandable-text";
import { CollapsibleCard } from "@/components/collapsible-card";

/** Restoran nomidan monogramma (bosh harflar). */
function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Ma'lumot maydoni — ikonli, yorliq ustida qiymat. */
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
    <div className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </div>
        <div className="text-sm text-slate-800 dark:text-slate-100">
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

/**
 * Hi-Tech bo'lim — shishasimon karta, sarlavhali (ikon chip + nom). Sarlavhaga
 * bosilsa yig'iladi/ochiladi (akkordeon). Ikonli sarlavha SHU YERDA (server)
 * render qilinadi va tayyor markup CollapsibleCard (klient) ga uzatiladi — lucide
 * ikon komponenti klient chegarasidan o'tmaydi (RSC ikon-prop tuzog'i).
 */
function Section({
  icon: Icon,
  title,
  action,
  children,
  className,
  defaultOpen = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  // Bo'limlar standart holatda YOPIQ — foydalanuvchi kerakligini o'zi ochadi.
  const header = (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500/15 to-primary-500/5 text-primary-600 ring-1 ring-inset ring-primary-500/20 dark:text-primary-400">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
        {title}
      </h2>
    </>
  );

  return (
    <CollapsibleCard
      header={header}
      action={action}
      className={className}
      defaultOpen={defaultOpen}
    >
      {children}
    </CollapsibleCard>
  );
}

/** Hero ichidagi KPI plitkasi (qorong'i fon uchun). */
function StatTile({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const valueTone = {
    default: "text-white",
    ok: "text-emerald-300",
    warn: "text-amber-300",
    danger: "text-rose-300",
  }[tone];
  const iconTone = {
    default: "text-slate-400",
    ok: "text-emerald-400",
    warn: "text-amber-400",
    danger: "text-rose-400",
  }[tone];
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon className={cn("h-3.5 w-3.5", iconTone)} />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums sm:text-lg",
          valueTone,
        )}
      >
        {value}
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
      <span
        className={`${base} bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300`}
      >
        <XCircle className="h-3 w-3" />
        To&apos;lov muddati o&apos;tgan (Joyida emas!)
      </span>
    );
  }

  // Amber — to'lov yaqin (1..5 kun)
  if (days <= 5) {
    return (
      <span
        className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`}
      >
        <AlertTriangle className="h-3 w-3" />
        To&apos;lov yaqin (
        <span className="font-semibold tabular-nums">{days}</span> kun qoldi)
      </span>
    );
  }

  // Yashil — faol, muddat uzoq
  return (
    <span
      className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300`}
    >
      <CheckCircle2 className="h-3 w-3" />
      Faol (<span className="font-semibold tabular-nums">{days}</span> kun bor)
    </span>
  );
}

/**
 * Mijoz to'liq profili — /mijozlar/[id] sahifasi VA intercepting-route modali
 * (@modal) ikkalasi shu YAGONA komponentni ishlatadi (kod takrorlanmaydi).
 */
// Profil ochilishida Biznex API'ni ko'pi bilan shuncha kutamiz. Fon
// sinxronizatsiyasi uzunroq (8s) timeout bilan ishlaydi — u yerda kechikish
// muammo emas, bu yerda esa foydalanuvchi kutib turadi.
const PROFILE_BIZNEX_TIMEOUT_MS = 2500;

export async function ClientProfile({ id }: { id: string }) {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  // Usta (INSTALLER) — mijoz profilini FAQAT o'qish uchun ko'radi (ma'lumot,
  // qo'ng'iroq tarixi, uskunalar); to'lov/muammo/soliq/tahrirlash unga tegishli emas.
  const isInstaller = session.role === "INSTALLER";

  // HAMMA mustaqil so'rov BIR VAQTDA — ilgari ular ketma-ket bajarilardi
  // (client → biznex → audit → turlar → ombor → ustalar), ya'ni profil ochilishi
  // shu kechikishlar YIG'INDISIni kutardi. Endi eng sekinigacha kutiladi.
  const [client, activity, typeRows, whStock, ustaUsers, ustaStockRows] =
    await Promise.all([
      db.client.findUnique({
        where: { id },
        include: {
          // Ro'yxatlar cheklangan: 300 ta qo'ng'iroqli mijozda profil sekinlashmasin.
          // UI baribir qisqartirib ko'rsatadi (CollapsibleList).
          payments: {
            orderBy: { paidAt: "desc" },
            take: 60,
            include: { recordedBy: { select: { name: true } } },
          },
          callLogs: {
            orderBy: { calledAt: "desc" },
            take: 60,
            include: {
              operator: { select: { name: true } },
              editedBy: { select: { name: true } },
            },
          },
          tickets: { orderBy: { createdAt: "desc" }, take: 40 },
          phones: { orderBy: { createdAt: "asc" } },
          specialNoteBy: { select: { name: true } },
          equipmentItems: { include: { equipmentType: true } },
          returnRequests: {
            where: { status: { in: ["PENDING", "APPROVED"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          taxConnections: { orderBy: { createdAt: "desc" }, take: 1 },
          // Karta egasi tasdig'ini kutayotgan to'lovlar — hali Payment EMAS, lekin
          // operator "kiritdim, qani u?" demasligi uchun profilda ko'rinishi kerak.
          cardPayments: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            include: { recordedBy: { select: { name: true } } },
          },
        },
      }),
      // Faoliyat jurnali — shu mijozga tegishli amallar (audit)
      db.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          userName: true,
          detail: true,
          createdAt: true,
        },
      }),
      // Ombordagi turlar (manager biriktirish formasi uchun)
      db.equipmentType.findMany({ orderBy: { name: "asc" } }),
      db.inventoryStock.findMany({ where: { locationType: "WAREHOUSE" } }),
      // Ustalar zaxirasi (o'zi olib borgan uskunalar) — o'rnatishda manba tanlash uchun
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

  if (!client) notFound();

  // Biznex obuna holati — TASHQI API. Mijoz ma'lumotidan keyin (telefon kerak),
  // lekin qisqa timeout bilan: integratsiya sekinlashsa profil ochilishi
  // to'xtab qolmasin — badge shunchaki ko'rsatilmaydi.
  const subscription = await getBiznexSubscription(client.phone, {
    timeoutMs: PROFILE_BIZNEX_TIMEOUT_MS,
  });

  const whMap = new Map(whStock.map((s) => [s.equipmentTypeId, s.quantity]));
  const eqTypes: EqTypeOpt[] = typeRows.map((t) => ({
    id: t.id,
    name: t.name,
    rentalPrice: t.rentalPrice,
    salePrice: t.salePrice,
    warehouse: whMap.get(t.id) ?? 0,
  }));

  const ustaNameById = new Map(ustaUsers.map((u) => [u.id, u.name]));
  const ustaSrcMap = new Map<
    string,
    { equipmentTypeId: string; quantity: number }[]
  >();
  for (const r of ustaStockRows) {
    const name = ustaNameById.get(r.locationId);
    if (!name) continue; // faqat faol ustalar
    const arr = ustaSrcMap.get(r.locationId) ?? [];
    arr.push({ equipmentTypeId: r.equipmentTypeId, quantity: r.quantity });
    ustaSrcMap.set(r.locationId, arr);
  }
  const ustaSources: UstaSource[] = [...ustaSrcMap.entries()].map(
    ([ustaId, items]) => ({
      ustaId,
      ustaName: ustaNameById.get(ustaId)!,
      items,
    }),
  );

  const eqItems: EqItem[] = client.equipmentItems.map((e) => ({
    id: e.id,
    name: e.equipmentType.name,
    ownership: e.ownership,
    quantity: e.quantity,
    // Biriktirishda kelishilgan narx (unitPrice) bo'lsa — o'sha; aks holda turning standarti.
    rentalPrice:
      e.ownership === "RENTAL" && e.unitPrice != null
        ? e.unitPrice
        : e.equipmentType.rentalPrice,
    salePrice:
      e.ownership === "SOLD" && e.unitPrice != null
        ? e.unitPrice
        : e.equipmentType.salePrice,
  }));

  // Oylik to'lov = monthlyAmount (mijoz to'laydigan JAMI). Uskuna ijara summasi
  // shundan qanchasi ekanini ko'rsatish uchun alohida hisoblanadi (qo'shilmaydi).
  const equipmentMonthly = eqItems
    .filter((i) => i.ownership === "RENTAL")
    .reduce((sum, i) => sum + i.rentalPrice * i.quantity, 0);
  const effectiveMonthly = client.monthlyAmount;

  const openReturn = client.returnRequests[0]
    ? {
        status: client.returnRequests[0].status,
        note: client.returnRequests[0].note,
      }
    : null;

  const soliqDocUrl = (p: string | null) =>
    p ? `/api/soliq/${p.replace(/^soliq\//, "")}` : null;
  // Fayl PDF mi (rasm sifatida emas, iframe'da ko'rsatiladi)
  const isPdfPath = (p: string | null) =>
    !!p && p.toLowerCase().endsWith(".pdf");
  const soliq = client.taxConnections[0] ?? null;

  // Hero KPI: Biznex obuna plitkasi (rang bilan shoshilinchlik).
  const subTile: { value: string; tone: "default" | "ok" | "warn" | "danger" } =
    subscription.status === "unknown"
      ? { value: "—", tone: "default" }
      : subscription.status === "not_found"
        ? { value: "Topilmadi", tone: "danger" }
        : subscription.status === "expired" ||
            subscription.status === "inactive" ||
            subscription.remainingDays <= 0
          ? { value: "Muddati o'tgan", tone: "danger" }
          : {
              value: `${subscription.remainingDays} kun`,
              tone: subscription.remainingDays <= 5 ? "warn" : "ok",
            };

  const initials = initialsOf(client.restaurantName || client.fullName);
  const isOnline = client.status === "ACTIVE" && client.stage !== "REFUSED";

  return (
    <div className="space-y-6">
      {/* ——— Hero (hi-tech) ——— */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 text-white shadow-lg sm:p-6">
        {/* Yorug'lik dog'lari + nozik to'r — texnologik fon */}
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.4)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_72%)]" />

        <div className="relative">
          <Link
            href="/mijozlar"
            className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Mijozlar ro'yxati
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {/* Monogramma avatar + holat nuqtasi */}
              <div className="relative shrink-0">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-xl font-bold tracking-tight text-white shadow-lg ring-1 ring-white/25">
                  {initials}
                </div>
                <span
                  className={cn(
                    "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-slate-950",
                    isOnline ? "bg-emerald-500" : "bg-slate-500",
                  )}
                  title={isOnline ? "Faol" : "Nofaol"}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full bg-white",
                      isOnline && "animate-pulse",
                    )}
                  />
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                    {client.restaurantName}
                  </h1>
                  <SpecialNoteBell
                    clientId={client.id}
                    restaurantName={client.restaurantName || client.fullName}
                    note={client.specialNote}
                    noteBy={client.specialNoteBy?.name ?? null}
                    noteAt={
                      client.specialNoteAt
                        ? client.specialNoteAt.toISOString()
                        : null
                    }
                  />
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                  <UserIcon className="h-3.5 w-3.5" />
                  {client.fullName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ClientVersionPicker
                    clientId={client.id}
                    version={client.appVersion}
                  />
                  <ClientStatusBadge status={client.status} />
                  {client.stage === "REFUSED" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30">
                      <Ban className="h-3 w-3" /> Otkaz
                    </span>
                  )}
                  <BiznexSubscriptionBadge sub={subscription} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Otkaz — biznes qarori, usta uchun emas; Tahrirlash — usta ham
                  qila oladi (faqat asosiy ma'lumot, ClientForm `restricted`). */}
              {!isInstaller && client.stage !== "REFUSED" && (
                <ClientRefuseButton
                  clientId={client.id}
                  restaurantName={client.restaurantName}
                />
              )}
              <Link href={`/mijozlar/${client.id}/tahrir`}>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20">
                  <Pencil className="h-4 w-4" />
                  Tahrirlash
                </span>
              </Link>
            </div>
          </div>

          {/* KPI plitkalar */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              icon={Wallet}
              label="Oylik to'lov"
              value={formatMoney(client.monthlyAmount, client.currency)}
            />
            <StatTile
              icon={Calendar}
              label="Keyingi to'lov"
              value={
                client.nextPaymentDate
                  ? formatDate(client.nextPaymentDate)
                  : "—"
              }
            />
            <StatTile
              icon={TrendingDown}
              label="Qarz"
              value={
                client.debtAmount > 0
                  ? formatMoney(client.debtAmount, client.currency)
                  : "Yo'q"
              }
              tone={client.debtAmount > 0 ? "danger" : "ok"}
            />
            <StatTile
              icon={ShieldCheck}
              label="Biznex obuna"
              value={subTile.value}
              tone={subTile.tone}
            />
          </div>
        </div>
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
          <Section icon={Building2} title="Ma'lumotlar">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <InfoRow
                icon={Phone}
                label="Asosiy telefon"
                value={
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={`tel:${normalizePhone(client.phone)}`}
                      className="text-primary-600 dark:text-primary-400"
                    >
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
                      <a
                        href={`tel:${normalizePhone(p.number)}`}
                        className="text-primary-600 dark:text-primary-400"
                      >
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
              <InfoRow icon={Wrench} label="Apparat" value={client.equipment} />
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
            </div>
          </Section>

          <Section icon={PhoneCall} title="Qo'ng'iroq jurnali">
            <div className="space-y-5">
              {!isInstaller && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
                  <CallLogForm clientId={client.id} />
                </div>
              )}

              {client.callLogs.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Hali qo'ng'iroq yozuvi yo'q
                </p>
              )}
              <CollapsibleList className="space-y-3" previewCount={3}>
                {client.callLogs.map((log) => {
                  // Egasi (yozgan operator) — vaqt cheklovisiz tahrirlay oladi;
                  // o'chirish esa yozilganidan keyin 5 soat ichida (admin doim).
                  const isOwner =
                    !!log.operatorId && log.operatorId === session.userId;
                  const withinDeleteWindow =
                    Date.now() - log.calledAt.getTime() <= 5 * 60 * 60 * 1000;
                  // Usta profilni FAQAT o'qiydi — o'zining vazifa-holat yozuvini
                  // ham shu yerdan tahrirlay olmasin (buning o'rni /vazifalarim).
                  const canEdit = !isInstaller && (isAdmin || isOwner);
                  const canDelete =
                    !isInstaller &&
                    (isAdmin || (isOwner && withinDeleteWindow));
                  return (
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
                          <ExpandableText
                            text={log.note}
                            className="mt-1 text-sm text-slate-700 dark:text-slate-200"
                          />
                        )}
                        {log.nextFollowUpDate && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            Keyingi qo'ng'iroq:{" "}
                            {formatDate(log.nextFollowUpDate)}
                          </p>
                        )}
                        {log.editedAt && (
                          <p
                            className="mt-1 text-xs italic text-slate-400 dark:text-slate-500"
                            title="To'liq o'zgarish (eski → yangi) pastdagi 'Faoliyat jurnali'da ko'rinadi"
                          >
                            tahrirlangan: {formatDateTime(log.editedAt)}
                            {log.editedBy ? ` · ${log.editedBy.name}` : ""}
                          </p>
                        )}
                      </div>
                      <CallLogActions
                        log={{
                          id: log.id,
                          result: log.result,
                          note: log.note,
                          nextFollowUpDate: log.nextFollowUpDate
                            ? log.nextFollowUpDate.toISOString()
                            : null,
                        }}
                        canEdit={canEdit}
                        canDelete={canDelete}
                      />
                    </div>
                  );
                })}
              </CollapsibleList>
            </div>
          </Section>

          {!isInstaller && (
            <Section icon={Wrench} title="Muammolar">
              <div className="space-y-5">
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
                        <TicketStatusControl
                          ticketId={t.id}
                          status={t.status}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {!isInstaller && (
            <Section icon={Activity} title="Faoliyat jurnali">
              <div>
                {activity.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Hali amal yozuvi yo'q
                  </p>
                ) : (
                  <CollapsibleList className="space-y-3" previewCount={4}>
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
                            <ExpandableText
                              text={a.detail}
                              className="text-xs text-slate-600 dark:text-slate-300"
                            />
                          )}
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {formatDateTime(a.createdAt)}
                            {a.userName ? ` · ${a.userName}` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CollapsibleList>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* O'ng ustun */}
        <div className="space-y-6">
          {!isInstaller && (
            <Section icon={Wallet} title="Obuna va to'lov">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Oylik to'lov
                  </span>
                  <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(client.monthlyAmount, client.currency)}
                  </span>
                </div>
                {equipmentMonthly > 0 &&
                  equipmentMonthly <= client.monthlyAmount && (
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
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Keyingi to'lov
                  </span>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {formatDate(client.nextPaymentDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Holat
                  </span>
                  <PaymentStatusBadge
                    nextPaymentDate={client.nextPaymentDate}
                  />
                </div>
                {client.debtAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Qarz qoldig'i
                    </span>
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
              </div>
            </Section>
          )}

          <Section icon={Package} title="Uskunalar">
            <div>
              <ClientEquipmentPanel
                clientId={client.id}
                clientName={client.restaurantName || client.fullName}
                role={session.role}
                currency={client.currency}
                items={eqItems}
                types={eqTypes}
                ustaSources={ustaSources}
                pendingReturn={openReturn}
              />
            </div>
          </Section>

          {!isInstaller && (
            <Section icon={Landmark} title="Soliqqa ulash">
              <div>
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
                        {TAX_CONNECTION_STATUS[
                          soliq.status as keyof typeof TAX_CONNECTION_STATUS
                        ] ?? soliq.status}
                      </span>
                      <Link
                        href="/soliq"
                        className="text-xs text-primary-600 hover:underline dark:text-primary-400"
                      >
                        Bo'limda ochish →
                      </Link>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">
                        Guvohnoma:{" "}
                      </span>
                      {soliq.certificateNo}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">
                        Rahbar:{" "}
                      </span>
                      {soliq.directorName} · {soliq.directorPhone}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <a
                        href={soliq.geoLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline dark:text-primary-400"
                      >
                        Geolokatsiya
                      </a>
                      {soliqDocUrl(soliq.certificatePath) && (
                        <DocumentLink
                          url={soliqDocUrl(soliq.certificatePath)!}
                          title="Guvohnoma fayli"
                          subtitle={client.restaurantName || client.fullName}
                          isPdf={isPdfPath(soliq.certificatePath)}
                          meta={[
                            { label: "Guvohnoma", value: soliq.certificateNo },
                            { label: "Rahbar", value: soliq.directorName },
                            {
                              label: "Holat",
                              value:
                                TAX_CONNECTION_STATUS[
                                  soliq.status as keyof typeof TAX_CONNECTION_STATUS
                                ] ?? soliq.status,
                            },
                            {
                              label: "Yuborilgan",
                              value: formatDate(soliq.createdAt),
                            },
                          ]}
                        />
                      )}
                      {soliqDocUrl(soliq.documentPath) && (
                        <DocumentLink
                          url={soliqDocUrl(soliq.documentPath)!}
                          title="Kadastr/ijara hujjati"
                          subtitle={client.restaurantName || client.fullName}
                          isPdf={isPdfPath(soliq.documentPath)}
                          meta={[
                            { label: "Guvohnoma", value: soliq.certificateNo },
                            { label: "Rahbar", value: soliq.directorName },
                            {
                              label: "Yuborilgan",
                              value: formatDate(soliq.createdAt),
                            },
                          ]}
                        />
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
              </div>
            </Section>
          )}

          {!isInstaller && (
            <Section icon={ReceiptText} title="To'lov tarixi">
              <div>
                {/* Tasdiq kutayotgan karta to'lovlari — hali hisobga olinmagan */}
                {client.cardPayments.length > 0 && (
                  <div className="mb-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                    {client.cardPayments.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                            {formatMoney(c.amount, c.currency)} — karta egasi
                            tasdig&apos;i kutilmoqda
                          </div>
                          <div className="text-xs text-amber-700/80 dark:text-amber-300/70">
                            {formatDate(c.paidAt)}
                            {c.recordedBy
                              ? ` · ${c.recordedBy.name}`
                              : ""} · {paymentMethodLabel(c.method)}
                          </div>
                        </div>
                        {c.receiptPath && (
                          <DocumentLink
                            variant="chip"
                            icon="receipt"
                            label="Chek"
                            url={`/api/card-receipts/${c.id}`}
                            title="Tasdiq kutayotgan chek"
                            subtitle={client.restaurantName || client.fullName}
                            isPdf={c.receiptMime === "application/pdf"}
                            note={c.receiptNote}
                            meta={[
                              {
                                label: "Summa",
                                value: formatMoney(c.amount, c.currency),
                              },
                              { label: "Sana", value: formatDate(c.paidAt) },
                              {
                                label: "Usul",
                                value: paymentMethodLabel(c.method),
                              },
                              {
                                label: "Kiritdi",
                                value: c.recordedBy?.name ?? "—",
                              },
                            ]}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {client.payments.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    To'lovlar yo'q
                  </p>
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
                                {p.method
                                  ? paymentMethodLabel(p.method)
                                  : p.receiptNote}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {/* Chek — ilgari profildan umuman ko'rib bo'lmasdi */}
                          {p.receiptPath && (
                            <DocumentLink
                              variant="chip"
                              icon="receipt"
                              label="Chek"
                              url={`/api/receipts/${p.id}`}
                              title="To'lov cheki"
                              subtitle={
                                client.restaurantName || client.fullName
                              }
                              isPdf={isPdfPath(p.receiptPath)}
                              note={p.receiptNote}
                              meta={[
                                {
                                  label: "Summa",
                                  value: formatMoney(p.amount, p.currency),
                                },
                                { label: "Sana", value: formatDate(p.paidAt) },
                                {
                                  label: "Usul",
                                  value: paymentMethodLabel(p.method),
                                },
                                {
                                  label: "Qabul qildi",
                                  value: p.recordedBy?.name ?? "—",
                                },
                              ]}
                            />
                          )}
                          <PaymentHistoryActions
                            canManage={isAdmin}
                            payment={{
                              id: p.id,
                              amount: p.amount,
                              currency: p.currency,
                              method: p.method,
                              paidAt: p.paidAt.toISOString(),
                              receiptNote: p.receiptNote,
                              label: {
                                amount: formatMoney(p.amount, p.currency),
                                date: formatDate(p.paidAt),
                                method: paymentMethodLabel(p.method),
                              },
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

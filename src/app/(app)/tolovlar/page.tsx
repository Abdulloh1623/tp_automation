import { startOfMonth } from "date-fns";
import { Users, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { TicketTabs } from "@/components/ticket-tabs";
import {
  PaymentMetricCard,
  type MetricDetailRow,
} from "@/components/payment-metric-card";
import { EmptyState } from "@/components/empty-state";
import { PaymentsTable, type PaymentRow } from "@/components/payments-table";
import {
  PendingReceiptsQueue,
  type PendingReceiptItem,
  type AmountCandidate,
} from "@/components/pending-receipts-queue";

import { formatDate, formatMoney, daysUntil } from "@/lib/utils";
import { paymentState, paymentUrgency, PAYMENT_STATE_LABEL } from "@/lib/payment-status";

/**
 * OCR summa nomzodlarini JSON matndan o'qiydi. Buzuq JSON sahifani
 * yiqitmasligi kerak — xato bo'lsa bo'sh ro'yxat.
 */
function parseCandidates(raw: string | null): AmountCandidate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.value === "number")
      .map((c) => ({
        value: c.value as number,
        label: typeof c.label === "string" ? c.label : null,
        currency: c.currency === "UZS" || c.currency === "USD" ? c.currency : null,
      }));
  } catch {
    return [];
  }
}

/**
 * Valyutalar aralash bo'lgani uchun jami har bir valyuta bo'yicha alohida
 * yig'iladi: "$1 200 · 3 000 000 so'm". Bo'sh ro'yxatda `undefined`.
 */
function totalByCurrency(items: { amount: number; currency: string }[]): string | undefined {
  if (items.length === 0) return undefined;
  const sums = new Map<string, number>();
  for (const it of items) sums.set(it.currency, (sums.get(it.currency) ?? 0) + it.amount);
  return [...sums.entries()].map(([cur, sum]) => formatMoney(sum, cur)).join(" · ");
}

export default async function PaymentsPage() {
  await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  const clients = await db.client.findMany({
    where: { status: "ACTIVE" },
    include: {
      assignedTo: { select: { name: true } },
      specialNoteBy: { select: { name: true } },
    },
  });

  const monthStart = startOfMonth(new Date());
  const monthPayments = await db.payment.findMany({
    where: { paidAt: { gte: monthStart } },
    orderBy: { paidAt: "desc" },
    include: {
      client: { select: { id: true, restaurantName: true, fullName: true, phone: true } },
      recordedBy: { select: { name: true } },
    },
  });

  // Telegram guruhidan kelgan, hali tasdiqlanmagan cheklar
  const pendingRows = await db.pendingPayment.findMany({
    where: { status: "PENDING" },
    orderBy: { receivedAt: "desc" },
    include: {
      suggestedClient: {
        select: { restaurantName: true, fullName: true, phone: true },
      },
    },
  });
  const pendingReceipts: PendingReceiptItem[] = pendingRows.map((p) => ({
    id: p.id,
    senderName: p.senderName,
    rawText: p.rawText,
    parsedName: p.parsedName,
    parsedPhone: p.parsedPhone,
    sheetNo: p.sheetNo,
    receiptMime: p.receiptMime,
    isPdf: p.receiptMime === "application/pdf",
    suggestedClientId: p.suggestedClientId,
    suggestedClientLabel: p.suggestedClient
      ? `${p.suggestedClient.restaurantName} — ${p.suggestedClient.fullName} (${p.suggestedClient.phone})`
      : null,
    receivedAt: p.receivedAt.toISOString(),
    isHistorical: p.source === "HISTORY",
    occurredAt: p.occurredAt?.toISOString() ?? null,
    suggestedAmount: p.suggestedAmount,
    suggestedCurrency: p.suggestedCurrency,
    amountConfidence: (p.amountConfidence as "high" | "low" | "none" | null) ?? null,
    amountCandidates: parseCandidates(p.amountCandidates),
  }));

  // Diqqat talab qiladiganlar tepada: summa o'qilmagan / taxminiy bo'lganlar,
  // keyin mijozi topilmaganlar. Ishonchli va to'liq to'ldirilganlar pastda.
  const attentionRank = (r: PendingReceiptItem): number =>
    (r.amountConfidence === "high" ? 2 : r.amountConfidence === "low" ? 1 : 0) +
    (r.suggestedClientId ? 2 : 0);
  pendingReceipts.sort((a, b) => attentionRank(a) - attentionRank(b));

  // Holatlarni hisoblash
  const withState = clients
    .map((c) => ({ c, state: paymentState(c.nextPaymentDate) }))
    .sort((a, b) => {
      const u = paymentUrgency(a.state) - paymentUrgency(b.state);
      if (u !== 0) return u;
      const da = a.c.nextPaymentDate?.getTime() ?? Infinity;
      const dbt = b.c.nextPaymentDate?.getTime() ?? Infinity;
      return da - dbt;
    });

  const overdue = withState.filter((x) => x.state === "OVERDUE");
  const dueToday = withState.filter((x) => x.state === "DUE_TODAY");

  const overdueUsd = overdue
    .filter((x) => x.c.currency === "USD")
    .reduce((sum, x) => sum + x.c.monthlyAmount, 0);

  const collectedUsd = monthPayments
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => sum + p.amount, 0);

  // Metrik kartalar ustiga bosilganda ochiladigan ro'yxatlar
  const clientDetail = (c: (typeof clients)[number]): MetricDetailRow => {
    const d = daysUntil(c.nextPaymentDate);
    return {
      clientId: c.id,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      phone: c.phone,
      amountFmt: formatMoney(c.monthlyAmount, c.currency),
      dateFmt: formatDate(c.nextPaymentDate),
      hint: d === null ? null : d < 0 ? `${Math.abs(d)} kun o'tdi` : d === 0 ? "bugun" : null,
      operatorName: c.assignedTo?.name ?? null,
    };
  };
  const overdueDetails = overdue.map((x) => clientDetail(x.c));
  const dueTodayDetails = dueToday.map((x) => clientDetail(x.c));
  const collectedDetails: MetricDetailRow[] = monthPayments.map((p) => ({
    clientId: p.clientId,
    restaurantName: p.client.restaurantName,
    fullName: p.client.fullName,
    phone: p.client.phone,
    amountFmt: formatMoney(p.amount, p.currency),
    dateFmt: formatDate(p.paidAt),
    hint: p.method,
    operatorName: p.recordedBy?.name ?? null,
  }));

  const rows: PaymentRow[] = withState.map(({ c, state }) => {
    const d = daysUntil(c.nextPaymentDate);
    const qoldi =
      d === null ? "—" : d < 0 ? `${Math.abs(d)} kun o'tdi` : d === 0 ? "bugun" : `${d} kun`;
    return {
      id: c.id,
      restaurantName: c.restaurantName,
      fullName: c.fullName,
      phone: c.phone,
      region: c.region,
      state,
      stateLabel: PAYMENT_STATE_LABEL[state],
      nextPaymentFmt: formatDate(c.nextPaymentDate),
      qoldi,
      overdue: state === "OVERDUE",
      monthlyFmt: formatMoney(c.monthlyAmount, c.currency),
      operatorName: c.assignedTo?.name ?? "—",
      specialNote: c.specialNote,
      specialNoteBy: c.specialNoteBy?.name ?? null,
      specialNoteAt: c.specialNoteAt ? c.specialNoteAt.toISOString() : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">To'lovlar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Obuna holati va to'lov yig'imi
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <PaymentMetricCard
          label="Muddati o'tgan"
          value={`${overdue.length} ta · ${formatMoney(overdueUsd, "USD")}`}
          iconName="overdue"
          tone="red"
          rows={overdueDetails}
          amountHeader="Oylik"
          dateHeader="To'lov sanasi"
          emptyText="Muddati o'tgan to'lov yo'q"
          totalFmt={totalByCurrency(overdue.map((x) => ({ amount: x.c.monthlyAmount, currency: x.c.currency })))}
        />
        <PaymentMetricCard
          label="Bugun to'lov kuni"
          value={`${dueToday.length} ta`}
          iconName="due-today"
          tone="amber"
          rows={dueTodayDetails}
          amountHeader="Oylik"
          dateHeader="To'lov sanasi"
          emptyText="Bugun to'lov kuni bo'lgan mijoz yo'q"
          totalFmt={totalByCurrency(dueToday.map((x) => ({ amount: x.c.monthlyAmount, currency: x.c.currency })))}
        />
        <PaymentMetricCard
          label="Bu oy yig'ilgan (USD)"
          value={formatMoney(collectedUsd, "USD")}
          iconName="collected"
          tone="emerald"
          rows={collectedDetails}
          amountHeader="To'langan summa"
          dateHeader="To'langan sana"
          emptyText="Bu oy hali to'lov qabul qilinmagan"
          totalFmt={totalByCurrency(monthPayments)}
        />
      </div>

      {/* Ikki alohida bo'lim — ilgari ular ustma-ust turib aralashib ketardi.
          Tab naqshi loyihada allaqachon bor (Muammolar, Eskalatsiya). */}
      <TicketTabs
        tabs={[
          {
            key: "mijozlar",
            label: "Mijozlar to'lovi",
            icon: <Users className="h-4 w-4" />,
            tone: "sky",
            count: rows.length,
            content: <PaymentsTable rows={rows} />,
          },
          {
            key: "cheklar",
            label: "Telegram cheklari",
            icon: <Receipt className="h-4 w-4" />,
            tone: "amber",
            count: pendingReceipts.length,
            content:
              pendingReceipts.length > 0 ? (
                <PendingReceiptsQueue items={pendingReceipts} />
              ) : (
                <EmptyState
                  icon={Receipt}
                  title="Tasdiqlanmagan chek yo'q"
                  hint="Telegram «To'lov cheklari» guruhiga chek tashlansa, shu yerda paydo bo'ladi."
                />
              ),
          },
        ]}
        // Kutayotgan chek bo'lsa — o'sha bo'lim ochiladi (ish shu yerda)
        initialKey={pendingReceipts.length > 0 ? "cheklar" : "mijozlar"}
      />
    </div>
  );
}

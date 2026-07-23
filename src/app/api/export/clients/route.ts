import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCsv } from "@/lib/csv-export";
import { clientStatusLabel, ownershipLabel } from "@/lib/constants";
import { IMPORT_FIELDS } from "@/lib/import-fields";

// Sana round-trip uchun yyyy-mm-dd (import parseDate shu formatni tushunadi).
function iso(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
function numStr(n: number): string {
  return n ? String(n) : "";
}

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "MANAGER", "OPERATOR"]);
  if (!auth.ok) {
    return new Response(auth.status === 401 ? "Unauthorized" : "Forbidden", {
      status: auth.status,
    });
  }
  const session = auth.session;

  // Operator faqat o'ziga biriktirilganlarni eksport qiladi
  const where =
    session.role === "OPERATOR" ? { assignedToId: session.userId } : {};

  const clients = await db.client.findMany({
    where,
    orderBy: { restaurantName: "asc" },
    include: {
      assignedTo: { select: { name: true } },
      phones: { orderBy: { createdAt: "asc" } },
      equipmentItems: {
        where: { quantity: { gt: 0 } },
        orderBy: { quantity: "desc" },
        include: { equipmentType: { select: { name: true } } },
      },
      payments: { orderBy: { paidAt: "desc" }, take: 1 },
    },
  });

  // Ustunlar import maydonlariga AYNAN mos (round-trip: export -> import) —
  // sarlavhalar IMPORT_FIELDS yorliqlari, shuning uchun qayta importda avto-mapping ishlaydi.
  const cols = IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label }));

  const rows = clients.map((c) => {
    const extra = c.phones[0]; // birlamchidan keyingi birinchi qo'shimcha telefon
    const eq = c.equipmentItems[0]; // asosiy (eng ko'p miqdordagi) uskuna
    const lastPay = c.payments[0];
    return {
      fullName: c.fullName,
      restaurantName: c.restaurantName,
      phone: c.phone,
      region: c.region ?? "",
      phoneSecondary: extra ? extra.number : "",
      contractNumber: c.contractNumber ?? "",
      contractDate: iso(c.contractDate),
      installerName: c.installerName ?? "",
      monoblokCount: String(c.monoblokCount),
      equipment: c.equipment ?? "",
      monthlyAmount: numStr(c.monthlyAmount),
      currency: c.currency,
      nextPaymentDate: iso(c.nextPaymentDate),
      debtAmount: numStr(c.debtAmount),
      lastPaymentAmount: lastPay ? numStr(lastPay.amount) : "",
      lastPaymentDate: lastPay ? iso(lastPay.paidAt) : "",
      equipmentType: eq ? eq.equipmentType.name : "",
      equipmentQty: eq ? String(eq.quantity) : "",
      equipmentOwnership: eq ? ownershipLabel(eq.ownership) : "",
      status: clientStatusLabel(c.status),
      notes: c.notes ?? "",
      operator: c.assignedTo?.name ?? "",
    };
  });

  const csv = "﻿" + buildCsv(cols, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mijozlar.csv"',
    },
  });
}

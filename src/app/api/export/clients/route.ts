import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCsv } from "@/lib/csv-export";
import { clientStatusLabel } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!["ADMIN", "OPERATOR"].includes(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Operator faqat o'ziga biriktirilganlarni eksport qiladi
  const where =
    session.role === "OPERATOR" ? { assignedToId: session.userId } : {};

  const clients = await db.client.findMany({
    where,
    orderBy: { restaurantName: "asc" },
    include: {
      assignedTo: { select: { name: true } },
      phones: { orderBy: { createdAt: "asc" } },
    },
  });

  const cols = [
    { key: "restoran", label: "Restoran" },
    { key: "fio", label: "FIO" },
    { key: "viloyat", label: "Viloyat" },
    { key: "telefon", label: "Telefon" },
    { key: "qoshimchaTel", label: "Qo'shimcha telefonlar" },
    { key: "shartnoma", label: "Shartnoma" },
    { key: "holat", label: "Holat" },
    { key: "summa", label: "Oylik" },
    { key: "valyuta", label: "Valyuta" },
    { key: "keyingiTolov", label: "Keyingi to'lov" },
    { key: "operator", label: "Operator" },
  ];
  const rows = clients.map((c) => ({
    restoran: c.restaurantName,
    fio: c.fullName,
    viloyat: c.region ?? "",
    telefon: c.phone,
    qoshimchaTel: c.phones.map((p) => `${p.label}: ${p.number}`).join("; "),
    shartnoma: c.contractNumber ?? "",
    holat: clientStatusLabel(c.status),
    summa: c.monthlyAmount,
    valyuta: c.currency,
    keyingiTolov: c.nextPaymentDate ? formatDate(c.nextPaymentDate) : "",
    operator: c.assignedTo?.name ?? "",
  }));

  const csv = "﻿" + buildCsv(cols, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mijozlar.csv"',
    },
  });
}

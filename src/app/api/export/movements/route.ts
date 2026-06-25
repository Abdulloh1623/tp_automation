import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCsv } from "@/lib/csv-export";
import { formatDateTime } from "@/lib/utils";
import { resolveMovements } from "@/lib/movements";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";
  const reason = url.searchParams.get("reason") ?? "";
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10) || 30));
  const since = new Date(Date.now() - days * 86400000);

  const where: Prisma.EquipmentMovementWhereInput = { createdAt: { gte: since } };
  if (type) where.equipmentTypeId = type;
  if (reason) where.reason = reason;

  const [movements, users, clients, eqTypes] = await Promise.all([
    db.equipmentMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    db.user.findMany({ select: { id: true, name: true } }),
    db.client.findMany({ select: { id: true, restaurantName: true } }),
    db.equipmentType.findMany({ select: { id: true, name: true } }),
  ]);

  const userName = new Map(users.map((u) => [u.id, u.name]));
  const clientName = new Map(clients.map((c) => [c.id, c.restaurantName]));
  const typeName = new Map(eqTypes.map((t) => [t.id, t.name]));
  const rows = resolveMovements(movements, typeName, userName, clientName).map((m) => ({
    sana: formatDateTime(m.date),
    texnika: m.typeName,
    miqdor: m.quantity,
    qayerdan: m.from,
    qayerga: m.to,
    amal: m.reason,
    kim: m.user,
    izoh: m.note ?? "",
  }));

  const cols = [
    { key: "sana", label: "Sana" },
    { key: "texnika", label: "Texnika" },
    { key: "miqdor", label: "Miqdor" },
    { key: "qayerdan", label: "Qayerdan" },
    { key: "qayerga", label: "Qayerga" },
    { key: "amal", label: "Amal" },
    { key: "kim", label: "Kim" },
    { key: "izoh", label: "Izoh" },
  ];
  const csv = "﻿" + buildCsv(cols, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ombor-harakatlar.csv"',
    },
  });
}

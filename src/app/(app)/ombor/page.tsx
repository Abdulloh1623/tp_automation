import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  InventoryManager,
  type InvType,
  type UstaStock,
} from "@/components/inventory-manager";
import { MovementsHistory } from "@/components/movements-history";
import { resolveMovements } from "@/lib/movements";

type SearchParams = Promise<{ movType?: string; movReason?: string; movDays?: string }>;

export default async function OmborPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["ADMIN", "MANAGER"]);
  const sp = await searchParams;
  const movType = sp.movType ?? "";
  const movReason = sp.movReason ?? "";
  const movDays = Math.min(365, Math.max(1, parseInt(sp.movDays ?? "30", 10) || 30));
  const since = new Date(Date.now() - movDays * 86400000);

  const movWhere: Prisma.EquipmentMovementWhereInput = { createdAt: { gte: since } };
  if (movType) movWhere.equipmentTypeId = movType;
  if (movReason) movWhere.reason = movReason;

  const [typesRaw, warehouse, ustaRows, brakRows, ustalarFull, usersById, movements, clientsById] =
    await Promise.all([
      db.equipmentType.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
      db.inventoryStock.findMany({ where: { locationType: "WAREHOUSE" } }),
      db.inventoryStock.findMany({
        where: { locationType: "USTA" },
        include: { equipmentType: { select: { name: true } } },
      }),
      db.inventoryStock.findMany({
        where: { locationType: "BRAK" },
        include: { equipmentType: { select: { name: true } } },
      }),
      db.user.findMany({
        where: { role: "INSTALLER", isActive: true },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      db.user.findMany({ select: { id: true, name: true } }),
      db.equipmentMovement.findMany({
        where: movWhere,
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      db.client.findMany({ select: { id: true, restaurantName: true } }),
    ]);

  const clientEquipment = await db.clientEquipment.findMany({
    where: { quantity: { gt: 0 } },
    include: { equipmentType: { select: { salePrice: true, rentalPrice: true } } },
  });

  const ustalar = ustalarFull.map((u) => ({ id: u.id, name: u.name }));
  const userName = new Map(usersById.map((u) => [u.id, u.name]));
  const clientName = new Map(clientsById.map((c) => [c.id, c.restaurantName]));

  const whMap = new Map(warehouse.map((s) => [s.equipmentTypeId, s.quantity]));
  const types: InvType[] = typesRaw.map((t) => ({
    id: t.id,
    name: t.name,
    rentalPrice: t.rentalPrice,
    salePrice: t.salePrice,
    minStock: t.minStock,
    isActive: t.isActive,
    warehouse: whMap.get(t.id) ?? 0,
  }));

  // Kam zaxira: faol tur, minStock belgilangan va qoldiq undan past
  const lowStock = types.filter((t) => t.isActive && t.minStock > 0 && t.warehouse < t.minStock);

  const brak = brakRows
    .filter((r) => r.quantity > 0)
    .map((r) => ({ name: r.equipmentType.name, quantity: r.quantity }));

  const ustaMap = new Map<string, { name: string; quantity: number }[]>();
  for (const r of ustaRows) {
    if (r.quantity <= 0) continue;
    const arr = ustaMap.get(r.locationId) ?? [];
    arr.push({ name: r.equipmentType.name, quantity: r.quantity });
    ustaMap.set(r.locationId, arr);
  }
  const ustaStock: UstaStock[] = ustalar
    .map((u) => ({ ustaId: u.id, ustaName: u.name, items: ustaMap.get(u.id) ?? [] }))
    .filter((u) => u.items.length > 0);

  const priceById = new Map(typesRaw.map((t) => [t.id, t.salePrice]));
  const warehouseUnits = warehouse.reduce((s, r) => s + r.quantity, 0);
  const warehouseValue = warehouse.reduce(
    (s, r) => s + r.quantity * (priceById.get(r.equipmentTypeId) ?? 0),
    0,
  );
  const deployedUnits = clientEquipment.reduce((s, e) => s + e.quantity, 0);
  const monthlyRentalRevenue = clientEquipment
    .filter((e) => e.ownership === "RENTAL")
    .reduce((s, e) => s + e.quantity * e.equipmentType.rentalPrice, 0);
  const ustaUnits = ustaRows.reduce((s, r) => s + r.quantity, 0);

  const stats: { label: string; value: string; warn?: boolean }[] = [
    { label: "Omborda (dona)", value: String(warehouseUnits) },
    { label: "Ombor qiymati ($)", value: warehouseValue.toLocaleString("en-US") },
    { label: "Mijozlarda (dona)", value: String(deployedUnits) },
    { label: "Ijara daromadi ($/oy)", value: monthlyRentalRevenue.toLocaleString("en-US") },
    { label: "Ustalarda (dona)", value: String(ustaUnits) },
    { label: "Kam zaxira", value: String(lowStock.length), warn: lowStock.length > 0 },
  ];

  const typeName = new Map(typesRaw.map((t) => [t.id, t.name]));
  const movementRows = resolveMovements(movements, typeName, userName, clientName);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Ombor</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Texnika qoldig'i, kirim, taqsimot va harakatlar tarixi
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className={
              "rounded-xl border bg-white dark:bg-slate-900 p-3 " +
              (s.warn ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/40" : "border-slate-200 dark:border-slate-800")
            }
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
            <div
              className={
                "mt-1 text-lg font-semibold " +
                (s.warn ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100")
              }
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          <span className="font-medium">Kam zaxira:</span>{" "}
          {lowStock
            .map((t) => `${t.name} (${t.warehouse}/${t.minStock})`)
            .join(", ")}
        </div>
      )}

      <InventoryManager
        types={types}
        ustalar={ustalar}
        ustaStock={ustaStock}
        brak={brak}
      />
      <MovementsHistory
        rows={movementRows}
        types={types.map((t) => ({ id: t.id, name: t.name }))}
        filter={{ type: movType, reason: movReason, days: String(movDays) }}
      />
    </div>
  );
}

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseRegions } from "@/lib/constants";
import { ReferenceBoard, type UstaInfo, type PriceInfo } from "@/components/reference-board";

export default async function MalumotnomaPage() {
  await requireRole(["ADMIN", "MANAGER", "OPERATOR", "VIEWER"]);

  const [ustalarFull, ustaStockRaw, typesRaw, warehouseRaw] = await Promise.all([
    db.user.findMany({
      where: { role: "INSTALLER", isActive: true },
      select: { id: true, name: true, phone: true, region: true, regions: true },
      orderBy: { name: "asc" },
    }),
    db.inventoryStock.findMany({
      where: { locationType: "USTA" },
      include: { equipmentType: { select: { name: true } } },
    }),
    db.equipmentType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    db.inventoryStock.findMany({ where: { locationType: "WAREHOUSE" } }),
  ]);

  const ustaMap = new Map<string, { name: string; quantity: number }[]>();
  for (const r of ustaStockRaw) {
    if (r.quantity <= 0) continue;
    const arr = ustaMap.get(r.locationId) ?? [];
    arr.push({ name: r.equipmentType.name, quantity: r.quantity });
    ustaMap.set(r.locationId, arr);
  }

  const ustalar: UstaInfo[] = ustalarFull.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    regions: parseRegions(u.regions, u.region),
    items: ustaMap.get(u.id) ?? [],
  }));

  const warehouseMap = new Map(warehouseRaw.map((r) => [r.equipmentTypeId, r.quantity]));
  const prices: PriceInfo[] = typesRaw.map((t) => ({
    id: t.id,
    name: t.name,
    salePrice: t.salePrice,
    rentalPrice: t.rentalPrice,
    warehouseQty: warehouseMap.get(t.id) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Ustalar va narxlar
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Mijozga usta aloqasi va uskuna narxlarini aytish uchun tezkor ma'lumotnoma
        </p>
      </div>
      <ReferenceBoard ustalar={ustalar} prices={prices} />
    </div>
  );
}

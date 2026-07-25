import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ClientForm } from "@/components/client-form";
import type { EqTypeOpt, UstaSource } from "@/components/client-equipment-panel";
import { createClient } from "@/actions/clients";

export default async function NewClientPage() {
  const session = await getSession();
  const canEquip = session?.role === "ADMIN" || session?.role === "MANAGER";

  const operators = await db.user.findMany({
    where: { role: { in: ["OPERATOR", "ADMIN"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Uskuna tanlash (faqat ADMIN/MANAGER) — turlar + ombor qoldig'i + usta zaxiralari.
  let equipmentTypes: EqTypeOpt[] | undefined;
  let ustaSources: UstaSource[] | undefined;
  if (canEquip) {
    const [typeRows, whStock, ustaUsers, ustaStockRows] = await Promise.all([
      db.equipmentType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      db.inventoryStock.findMany({ where: { locationType: "WAREHOUSE" } }),
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
    const whMap = new Map(whStock.map((s) => [s.equipmentTypeId, s.quantity]));
    equipmentTypes = typeRows.map((t) => ({
      id: t.id,
      name: t.name,
      rentalPrice: t.rentalPrice,
      salePrice: t.salePrice,
      warehouse: whMap.get(t.id) ?? 0,
    }));

    const ustaNameById = new Map(ustaUsers.map((u) => [u.id, u.name]));
    const ustaSrcMap = new Map<string, { equipmentTypeId: string; quantity: number }[]>();
    for (const r of ustaStockRows) {
      if (!ustaNameById.has(r.locationId)) continue;
      const arr = ustaSrcMap.get(r.locationId) ?? [];
      arr.push({ equipmentTypeId: r.equipmentTypeId, quantity: r.quantity });
      ustaSrcMap.set(r.locationId, arr);
    }
    ustaSources = [...ustaSrcMap.entries()].map(([ustaId, items]) => ({
      ustaId,
      ustaName: ustaNameById.get(ustaId)!,
      items,
    }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/mijozlar"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Mijozlar ro'yxati
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Yangi mijoz</h1>
      </div>

      <ClientForm
        action={createClient}
        operators={operators}
        submitLabel="Mijozni qo'shish"
        showInitialPayment
        equipmentTypes={equipmentTypes}
        ustaSources={ustaSources}
      />
    </div>
  );
}

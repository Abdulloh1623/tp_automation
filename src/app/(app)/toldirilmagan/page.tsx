import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { IncompleteTable, type IncompleteRow } from "@/components/incomplete-table";

// Mijoz "to'ldirilmagan" hisoblanadi: telefon yoki restoran nomi bo'sh.
// Bu dinamik — ma'lumot to'ldirilgach mijoz avtomatik bu ro'yxatdan chiqadi.
export default async function IncompletePage() {
  await requireRole(["ADMIN", "OPERATOR", "MANAGER"]);

  const clients: IncompleteRow[] = await db.client.findMany({
    where: {
      OR: [{ phone: "" }, { restaurantName: "" }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      restaurantName: true,
      fullName: true,
      phone: true,
      region: true,
      contractNumber: true,
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          To'ldirilmagan mijozlar
        </h1>
        <p className="text-sm text-slate-500">
          Ma'lumoti to'liq bo'lmagan mijozlar. Joyida to'ldiring — to'liq bo'lgach
          avtomatik bu ro'yxatdan chiqadi. — {clients.length} ta
        </p>
      </div>

      <IncompleteTable clients={clients} />
    </div>
  );
}

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { UstaManager, type ManagedUsta } from "@/components/usta-manager";

export default async function UstalarPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const rows = await db.user.findMany({
    where: { role: "INSTALLER" },
    select: {
      id: true,
      name: true,
      region: true,
      regions: true,
      phone: true,
      isActive: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const ustalar: ManagedUsta[] = rows;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Ustalar</h1>
        <p className="text-sm text-slate-500">
          Ustalarni qo'shish, tahrirlash, viloyat biriktirish va faollik nazorati
        </p>
      </div>
      <UstaManager ustalar={ustalar} />
    </div>
  );
}

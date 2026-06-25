import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { UserManager, type ManagedUser } from "@/components/user-manager";

export default async function UsersPage() {
  await requireRole(["ADMIN"]);

  const users = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      region: true,
      regions: true,
      phone: true,
      telegramId: true,
      dailyLeadTarget: true,
      isActive: true,
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Foydalanuvchilar</h1>
        <p className="text-sm text-slate-500">
          {users.length} ta foydalanuvchi · xodim/usta qo'shish, rol, parol va
          faollikni boshqarish
        </p>
      </div>
      <UserManager users={users as ManagedUser[]} />
    </div>
  );
}

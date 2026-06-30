import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { UserManager, type ManagedUser } from "@/components/user-manager";
import {
  PasswordResetRequests,
  type ResetRequestRow,
} from "@/components/password-reset-requests";
import { formatDateTime } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Menejer",
  OPERATOR: "Operator",
  INSTALLER: "Usta",
};

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

  const pendingResets = await db.passwordResetRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      note: true,
      createdAt: true,
      user: { select: { name: true, username: true, role: true } },
    },
  });
  const resetRows: ResetRequestRow[] = pendingResets.map((r) => ({
    id: r.id,
    userName: r.user.name,
    username: r.user.username,
    roleLabel: ROLE_LABEL[r.user.role] ?? r.user.role,
    note: r.note,
    requestedAt: formatDateTime(r.createdAt),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Foydalanuvchilar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {users.length} ta foydalanuvchi · xodim/usta qo'shish, rol, parol va
          faollikni boshqarish
        </p>
      </div>
      <PasswordResetRequests requests={resetRows} />
      <UserManager users={users as ManagedUser[]} />
    </div>
  );
}

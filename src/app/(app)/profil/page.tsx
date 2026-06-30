import { redirect } from "next/navigation";
import { User as UserIcon, Phone, MapPin, Shield } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfilePasswordForm } from "@/components/profile-password-form";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Menejer",
  OPERATOR: "Operator",
  INSTALLER: "Usta",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pending = await db.passwordResetRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Mening profilim</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Shaxsiy ma'lumotlar va parolni tiklash
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ma'lumotlar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={UserIcon} label="Ism" value={user.name} />
            <Row icon={Shield} label="Login" value={user.username} />
            <Row icon={Shield} label="Rol" value={ROLE_LABEL[user.role] ?? user.role} />
            <Row icon={Phone} label="Telefon" value={user.phone ?? "—"} />
            <Row icon={MapPin} label="Viloyat" value={user.region ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parolni tiklash</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfilePasswordForm
              hasPending={!!pending}
              requestedAt={pending ? formatDateTime(pending.createdAt) : undefined}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      <span className="w-20 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

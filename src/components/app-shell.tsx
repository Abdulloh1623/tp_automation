"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  PackageCheck,
  Users,
  UserX,
  CreditCard,
  Wrench,
  AlertTriangle,
  Warehouse,
  HardHat,
  BarChart3,
  Activity,
  UserCog,
  ScrollText,
  Upload,
  LogOut,
  Building2,
  CircleUser,
  Bell,
} from "lucide-react";
import { logout } from "@/actions/auth";
import { Toaster } from "@/components/toaster";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { userRoleLabel } from "@/lib/constants";
import type { Role } from "@/lib/rbac";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
};

const NAV: NavItem[] = [
  { href: "/", label: "Boshqaruv paneli", icon: LayoutDashboard, roles: ["ADMIN"] },
  { href: "/lidlar", label: "Kunlik ish", icon: PhoneCall, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { href: "/ombor", label: "Ombor", icon: Warehouse, roles: ["ADMIN", "MANAGER"] },
  { href: "/ustalar", label: "Ustalar", icon: HardHat, roles: ["ADMIN", "MANAGER"] },
  { href: "/mijozlar", label: "Mijozlar", icon: Users, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { href: "/toldirilmagan", label: "To'ldirilmagan", icon: UserX, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { href: "/tolovlar", label: "To'lovlar", icon: CreditCard, roles: ["ADMIN", "MANAGER"] },
  { href: "/muammolar", label: "Muammolar", icon: Wrench, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { href: "/eskalatsiya", label: "Eskalatsiya", icon: AlertTriangle, roles: ["ADMIN", "MANAGER"] },
  { href: "/qaytarish", label: "Qaytarish", icon: PackageCheck, roles: ["ADMIN", "MANAGER"] },
  { href: "/analitika", label: "Jonli analitika", icon: Activity, roles: ["ADMIN", "MANAGER"] },
  { href: "/hisobot", label: "Hisobot", icon: BarChart3, roles: ["ADMIN", "MANAGER"] },
  { href: "/foydalanuvchilar", label: "Foydalanuvchilar", icon: UserCog, roles: ["ADMIN"] },
  { href: "/audit", label: "Audit", icon: ScrollText, roles: ["ADMIN"] },
  { href: "/import", label: "Import", icon: Upload, roles: ["ADMIN"] },
  { href: "/bildirishnomalar", label: "Bildirishnomalar", icon: Bell, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
  { href: "/profil", label: "Profil", icon: CircleUser, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
];

export function AppShell({
  user,
  unreadCount = 0,
  children,
}: {
  user: { name: string; role: string };
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = NAV.filter((i) => i.roles.includes(user.role as Role));
  const badgeFor = (href: string) =>
    href === "/bildirishnomalar" && unreadCount > 0 ? unreadCount : 0;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">POS CRM</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">TP Automation</div>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {badgeFor(item.href) > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
                    {badgeFor(item.href)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <Link
            href="/profil"
            className="mb-2 block rounded-lg px-2 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {userRoleLabel(user.role)}
            </div>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-950 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Chiqish
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold dark:text-slate-100">POS CRM</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={logout}>
              <button type="submit" className="text-slate-500 dark:text-slate-400">
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
        </header>

        {/* Mobile nav — gorizontal skroll (rollar ko'p element ko'rsatadi) */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex shrink-0 min-w-[60px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-slate-600 dark:text-slate-300",
                )}
              >
                {badgeFor(item.href) > 0 && (
                  <span className="absolute right-1 top-0.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {badgeFor(item.href)}
                  </span>
                )}
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <Toaster />
      <ConfirmDialog />
    </div>
  );
}

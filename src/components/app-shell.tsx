"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  UserX,
  CreditCard,
  Wrench,
  Warehouse,
  HardHat,
  BarChart3,
  Activity,
  UserCog,
  ScrollText,
  SlidersHorizontal,
  LogOut,
  Building2,
  CircleUser,
  Bell,
  Ban,
  Lightbulb,
  Landmark,
  Wallet,
  PackageSearch,
  Database,
  HelpCircle,
} from "lucide-react";
import { logout } from "@/actions/auth";
import { Toaster } from "@/components/toaster";
import { ConfirmDialog, confirmDialog } from "@/components/confirm-dialog";
import { DocumentViewer } from "@/components/document-viewer";
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
type NavSection = { title?: string; items: NavItem[] };

// Bo'limlarga guruhlangan navigatsiya — sidebar'ni skanlashni osonlashtiradi.
// Bo'limdagi barcha element rolga to'g'ri kelmasa, sarlavha ham ko'rsatilmaydi.
const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Boshqaruv paneli", icon: LayoutDashboard, roles: ["ADMIN"] },
      { href: "/lidlar", label: "Kunlik ish", icon: PhoneCall, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
    ],
  },
  {
    title: "Mijozlar",
    items: [
      { href: "/mijozlar", label: "Mijozlar", icon: Users, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
      { href: "/muammoli-mijozlar", label: "Muammoli mijozlar", icon: UserX, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
      { href: "/tolovlar", label: "To'lovlar", icon: CreditCard, roles: ["ADMIN", "MANAGER", "OPERATOR"] },
    ],
  },
  {
    title: "Xizmat",
    items: [
      { href: "/muammolar", label: "Muammolar", icon: Wrench, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
      { href: "/soliq", label: "Soliqqa ulash", icon: Landmark, roles: ["ADMIN", "MANAGER", "OPERATOR"] },
      { href: "/otkaz", label: "Otkaz", icon: Ban, roles: ["ADMIN", "MANAGER", "OPERATOR"] },
      { href: "/takliflar", label: "Takliflar", icon: Lightbulb, roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    title: "Ombor",
    items: [
      { href: "/ombor", label: "Ombor", icon: Warehouse, roles: ["ADMIN", "MANAGER"] },
      { href: "/ustalar", label: "Ustalar", icon: HardHat, roles: ["ADMIN", "MANAGER"] },
      { href: "/uskuna-analitika", label: "Uskuna analitikasi", icon: PackageSearch, roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    title: "Tahlil",
    items: [
      { href: "/analitika", label: "Jonli analitika", icon: Activity, roles: ["ADMIN", "MANAGER"] },
      { href: "/moliya", label: "Moliya", icon: Wallet, roles: ["ADMIN", "MANAGER"] },
      { href: "/hisobot", label: "Hisobot", icon: BarChart3, roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    title: "Boshqaruv",
    items: [
      { href: "/foydalanuvchilar", label: "Foydalanuvchilar", icon: UserCog, roles: ["ADMIN"] },
      { href: "/audit", label: "Audit", icon: ScrollText, roles: ["ADMIN"] },
      { href: "/malumotlar", label: "Ma'lumotlar", icon: Database, roles: ["ADMIN"] },
      { href: "/sozlamalar", label: "Sozlamalar", icon: SlidersHorizontal, roles: ["ADMIN"] },
    ],
  },
  {
    items: [
      { href: "/faq", label: "FAQ", icon: HelpCircle, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
      { href: "/bildirishnomalar", label: "Bildirishnomalar", icon: Bell, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
      { href: "/profil", label: "Profil", icon: CircleUser, roles: ["ADMIN", "OPERATOR", "MANAGER"] },
    ],
  },
];

// Nav yonidagi badge foni — har bo'limga mos rang (oq matn bilan kontrast uchun -600).
// To'liq literal sinf nomlari (Tailwind JIT purge qilmasligi uchun).
const BADGE_COLOR: Record<string, string> = {
  "/lidlar": "bg-sky-600",
  "/muammolar": "bg-red-600",
  "/takliflar": "bg-emerald-600",
  "/soliq": "bg-teal-600",
  "/bildirishnomalar": "bg-indigo-600",
};
const badgeColorFor = (href: string) => BADGE_COLOR[href] ?? "bg-red-600";

/** Foydalanuvchi ismidan monogramma (bosh harflar) — avatar chipi uchun. */
function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AppShell({
  user,
  badges = {},
  children,
}: {
  user: { name: string; role: string };
  badges?: Record<string, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Rolga ko'ra filtrlangan bo'limlar (bo'sh bo'lim — sarlavhasiz — tushiriladi)
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles.includes(user.role as Role)),
  })).filter((s) => s.items.length > 0);
  const flatNav = sections.flatMap((s) => s.items);
  // Mobil navdagi faol elementni ko'rinishга surish (uzun gorizontal strip)
  const activeMobileRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeMobileRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);
  const badgeFor = (href: string) => badges[href] ?? 0;
  const badgeText = (n: number) => (n > 99 ? "99+" : String(n));

  // Tasodifiy bosishning oldini olish — chiqishdan oldin tasdiq so'raladi.
  async function handleLogout() {
    if (await confirmDialog({ title: "Tizimdan chiqasizmi?", confirmLabel: "Chiqish", variant: "primary" })) {
      await logout();
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — viewportga qulflangan (skroll qilinmaydi). Hi-Tech: nozik
          gradient fon, shishasimon aksentlar, faol elementda gradient + chap chiziq. */}
      <aside className="relative hidden h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-gradient-to-b from-white to-slate-50 dark:border-slate-800/80 dark:from-slate-900 dark:to-slate-950 md:flex">
        {/* Yuqori nozik yorug'lik dog'i — texnologik urg'u */}
        <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl" />

        <div className="relative flex items-center justify-between gap-2 px-4 py-4">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-lg shadow-primary-500/25 ring-1 ring-inset ring-white/25 transition-transform group-hover:scale-105">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                POS CRM
              </div>
              <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                TP Automation
              </div>
            </div>
          </Link>
          <ThemeToggle />
        </div>
        <div className="pointer-events-none h-px bg-gradient-to-r from-transparent via-primary-500/40 to-transparent" />

        <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section, si) => (
            <div key={section.title ?? `s${si}`} className="space-y-1">
              {section.title && (
                <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    {section.title}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-800" />
                </div>
              )}
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-xl py-2 pl-3 pr-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                      active
                        ? "bg-gradient-to-r from-primary-500/15 to-primary-500/5 text-primary-700 ring-1 ring-inset ring-primary-500/20 dark:text-primary-300"
                        : "text-slate-600 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/60",
                    )}
                  >
                    {/* Chap aksent chizig'i — faqat faol elementda */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary-400 to-primary-600 transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {/* Ikon chipi — profil InfoRow uslubida (faol: primary) */}
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active
                          ? "bg-primary-500/15 text-primary-600 ring-1 ring-inset ring-primary-500/25 dark:text-primary-300"
                          : "bg-slate-100 text-slate-500 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:text-slate-200",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {badgeFor(item.href) > 0 && (
                      <span
                        className={cn(
                          "min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white ring-1 ring-inset ring-white/20",
                          badgeColorFor(item.href),
                        )}
                        title={`${badgeFor(item.href)} ta hal qilinmagan`}
                      >
                        {badgeText(badgeFor(item.href))}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="relative border-t border-slate-200 p-3 dark:border-slate-800/80">
          <Link
            href="/profil"
            className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/70"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-bold text-white ring-1 ring-inset ring-white/10 dark:from-slate-600 dark:to-slate-800">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {user.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {userRoleLabel(user.role)}
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="group flex w-full items-center gap-2.5 rounded-xl py-2 pl-3 pr-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-300 dark:hover:bg-red-950/60 dark:hover:text-red-400"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-red-100 group-hover:text-red-600 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-red-950">
              <LogOut className="h-4 w-4" />
            </span>
            Chiqish
          </button>
        </div>
      </aside>

      {/* Main — mustaqil skroll qilinadigan ustun */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/90 md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-sm ring-1 ring-inset ring-white/25">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight dark:text-slate-100">POS CRM</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Chiqish"
              className="rounded-lg p-1 text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-400"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Mobile nav — gorizontal skroll (rollar ko'p element ko'rsatadi) */}
        <nav className="flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white/90 px-2.5 py-2.5 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/90 md:hidden">
          {flatNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                ref={active ? activeMobileRef : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                  active
                    ? "bg-gradient-to-b from-primary-500/15 to-primary-500/5 text-primary-700 ring-1 ring-inset ring-primary-500/20 dark:text-primary-300"
                    : "text-slate-500 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/60",
                )}
              >
                {badgeFor(item.href) > 0 && (
                  <span className={cn("absolute right-1 top-0.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white ring-1 ring-inset ring-white/20", badgeColorFor(item.href))}>
                    {badgeText(badgeFor(item.href))}
                  </span>
                )}
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-primary-500/15 text-primary-600 ring-1 ring-inset ring-primary-500/25 dark:text-primary-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <Toaster />
      <ConfirmDialog />
      <DocumentViewer />
    </div>
  );
}

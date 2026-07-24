import { HelpCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { FaqList, type FaqItem } from "@/components/faq-list";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

// FAQ — bilim bazasi. Barcha xodim (ADMIN/OPERATOR/MANAGER) o'qiy va yangi
// savol/yechim qo'sha oladi; tahrir/o'chirish faqat ADMIN qo'lida (action'da
// guardRole bilan qat'iy). RBAC: `/faq` → ROUTE_ROLES (lib/rbac.ts).
export default async function FaqPage() {
  const session = await requireRole(["ADMIN", "OPERATOR", "MANAGER"]);
  const isAdmin = session.role === "ADMIN";

  const rows = await db.faqEntry.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const items: FaqItem[] = rows.map((r) => ({
    id: r.id,
    question: r.question,
    details: r.details,
    solution: r.solution,
    authorName: r.createdBy?.name ?? null,
    createdAtFmt: formatDateTime(r.createdAt),
    // 2 soniyadan ortiq farq bo'lsa "tahrirlangan" deb belgilaymiz
    edited: r.updatedAt.getTime() - r.createdAt.getTime() > 2000,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
          <HelpCircle className="h-5 w-5 text-primary-600 dark:text-primary-300" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            FAQ — savol-javob
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ko'p uchraydigan muammolar va ularning yechimi. Istalgan xodim yangi
            savol qo'sha oladi{isAdmin ? "" : "; tahrir/o'chirish — faqat admin"}.
          </p>
        </div>
      </div>

      <FaqList items={items} isAdmin={isAdmin} canCreate />
    </div>
  );
}

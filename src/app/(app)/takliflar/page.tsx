import { subMonths } from "date-fns";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { SuggestionsList, type SuggestionItem } from "@/components/suggestions-list";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const suggestions = await db.suggestion.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // OPEN oldin, so'ng yangi
    take: 300,
    include: {
      client: {
        select: {
          id: true,
          restaurantName: true,
          fullName: true,
          phone: true,
          region: true,
          specialNote: true,
          specialNoteAt: true,
          specialNoteBy: { select: { name: true } },
        },
      },
    },
  });

  // createdById/resolvedById — oddiy string (Notification kabi), ismni qidiramiz
  const userIds = [
    ...new Set(
      suggestions
        .flatMap((s) => [s.createdById, s.resolvedById])
        .filter(Boolean) as string[],
    ),
  ];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const overdueBefore = subMonths(new Date(), 1);

  const items: SuggestionItem[] = suggestions.map((s) => ({
    id: s.id,
    body: s.body,
    status: s.status,
    clientId: s.client.id,
    restaurantName: s.client.restaurantName,
    fullName: s.client.fullName,
    phone: s.client.phone,
    region: s.client.region,
    createdByName: s.createdById ? nameById.get(s.createdById) ?? null : null,
    resolvedByName: s.resolvedById ? nameById.get(s.resolvedById) ?? null : null,
    resolutionNote: s.resolutionNote,
    createdAtFmt: formatDateTime(s.createdAt),
    resolvedAtFmt: s.resolvedAt ? formatDateTime(s.resolvedAt) : null,
    overdue: s.status === "OPEN" && s.createdAt < overdueBefore,
    specialNote: s.client.specialNote,
    specialNoteBy: s.client.specialNoteBy?.name ?? null,
    specialNoteAt: s.client.specialNoteAt ? s.client.specialNoteAt.toISOString() : null,
  }));

  const openCount = items.filter((i) => i.status === "OPEN").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Takliflar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Mijozlar bildirgan takliflar · {openCount} ta ochiq
        </p>
      </div>
      <SuggestionsList items={items} />
    </div>
  );
}

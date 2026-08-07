import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignedStaffScope } from "@/lib/visibility";
import { SectionTabs, type Bolim } from "./section-tabs";
import { TicketsSection } from "./tickets-section";
import { EscalationSection } from "./escalation-section";
import { ReturnSection } from "./return-section";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  bolim?: string;
  type?: string;
  priority?: string;
  assignee?: string;
}>;

function parseBolim(value: string | undefined): Bolim {
  return value === "eskalatsiya" || value === "qaytarish" ? value : "muammo";
}

export default async function MuammolarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { bolim: bolimParam, type, priority, assignee } = await searchParams;
  const bolim = parseBolim(bolimParam);

  const session = await requireRole(["ADMIN", "MANAGER", "OPERATOR"]);
  const isManager = ["ADMIN", "MANAGER"].includes(session.role);
  const ticketScope = assignedStaffScope(session.role, session.userId, "assignedStaffId");
  const escScope = assignedStaffScope(session.role, session.userId, "escalationStaffId");

  // Faqat tanlangan bo'limning og'ir so'rovi to'liq bajariladi; qolgan
  // ikkitasi uchun tab-badge'larda ko'rsatiladigan arzon count'lar yetarli.
  // Bo'lim komponenti JSX sifatida emas, funksiya sifatida chaqiriladi —
  // shu bilan uning Promise'i count so'rovlari bilan bir qatorda kutiladi.
  const [muammoCount, eskalatsiyaCount, qaytarishCount, sectionContent] = await Promise.all([
    db.ticket.count({ where: { ...ticketScope, status: { not: "RESOLVED" } } }),
    db.client.count({ where: { ...escScope, stage: "ESCALATED" } }),
    isManager
      ? db.equipmentReturnRequest.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    bolim === "eskalatsiya"
      ? EscalationSection({ session })
      : bolim === "qaytarish"
        ? ReturnSection({ session })
        : TicketsSection({ session, type, priority, assignee }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Muammolar</h1>

      <SectionTabs
        active={bolim}
        counts={{ muammo: muammoCount, eskalatsiya: eskalatsiyaCount, qaytarish: qaytarishCount }}
      />

      {sectionContent}
    </div>
  );
}
